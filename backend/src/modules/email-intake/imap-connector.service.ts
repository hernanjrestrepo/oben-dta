import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Tenant } from '../../entities/tenant.entity';
import { Client } from '../../entities/client.entity';
import {
  EmailIntakeMessage,
  EmailIntakeRoute,
  EmailIntakeStatus,
} from '../../entities/email-intake-message.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { ClassifierRegistry } from '../classification/classifier.registry';
import { ClassificationAttachment } from '../classification/classification.types';
import { QuotesService } from '../quotes/quotes.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';

export interface ImapIntakeConfig {
  enabled?: boolean;
  host: string;
  port?: number;
  secure?: boolean; // true = TLS implícito (993). false = STARTTLS.
  user: string;
  pass: string;
  folder?: string; // default 'INBOX'
  processedFolder?: string; // default 'Procesados'
  /** Si se define, se usa polling en vez de IDLE. */
  pollIntervalMs?: number;
}

const RECONNECT_BASE_DELAY_MS = 5_000;
const RECONNECT_MAX_DELAY_MS = 5 * 60_000;

/**
 * Adaptador de ENTRADA de correo real (WO-018 Sprint 6, requisito explícito
 * del usuario). Deliberadamente separado del Integration Hub / DocumentFlowEngine:
 * es un proceso de fondo que escucha un buzón IMAP real, y para cada correo
 * nuevo hace: dedupe → clasificación (mismo `ClassifierRegistry` que ya usa
 * Flujo 2) → enrutamiento al servicio correspondiente → marca \Seen → mueve a
 * la carpeta de procesados. El motor de negocio (QuotesService/PurchaseOrdersService)
 * no sabe ni le importa si el correo llegó por HTTP (`/quotes/email`) o por este
 * conector — recibe exactamente el mismo DTO en ambos casos.
 *
 * Garantías de "cero pérdida de correos":
 *  1. Checkpoint en BD (`email_intake_messages`, único por tenant+messageId) —
 *     sobrevive un reinicio del proceso.
 *  2. La bandera `\Seen` del propio buzón es una segunda barrera independiente:
 *     tras cada (re)conexión se vuelve a escanear TODO lo no leído, así que un
 *     correo que llegó mientras el conector estaba caído se procesa igual.
 *  3. Un fallo al enrutar (excepción del motor) NO deja el correo sin marcar —
 *     se registra `status='failed'` para revisión manual y se marca \Seen de
 *     todos modos, para no reintentarlo en bucle infinito ante un correo
 *     estructuralmente inprocesable. El error queda auditado, no oculto.
 */
@Injectable()
export class ImapConnectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImapConnectorService.name);
  private readonly connections = new Map<
    string,
    { client: ImapFlow | null; stopped: boolean }
  >();

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(EmailIntakeMessage)
    private readonly intake: Repository<EmailIntakeMessage>,
    private readonly classifiers: ClassifierRegistry,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit(): Promise<void> {
    const tenants = await this.tenants.find();
    for (const tenant of tenants) {
      const cfg = this.readConfig(tenant);
      if (cfg?.enabled) {
        this.connections.set(tenant.id, { client: null, stopped: false });
        // No se espera esta promesa — el conector corre indefinidamente en
        // background durante toda la vida del proceso.
        void this.runForTenant(tenant.id, cfg);
      }
    }
    if (this.connections.size === 0) {
      this.logger.log(
        'Sin tenants con IMAP real habilitado (integrationConfig.email.imap.enabled) — conector inactivo.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const [, entry] of this.connections) {
      entry.stopped = true;
      try {
        await entry.client?.logout();
      } catch {
        // el proceso está terminando; no hay nada que hacer con este error.
      }
    }
  }

  private readConfig(tenant: Tenant): ImapIntakeConfig | null {
    const emailCfg = (
      tenant.integrationConfig as Record<string, unknown> | undefined
    )?.email as Record<string, unknown> | undefined;
    if (emailCfg?.mode !== 'real') return null;
    const imap = emailCfg.imap as ImapIntakeConfig | undefined;
    if (!imap?.enabled || !imap.host || !imap.user || !imap.pass) return null;
    return imap;
  }

  private async runForTenant(
    tenantId: string,
    cfg: ImapIntakeConfig,
  ): Promise<void> {
    let attempt = 0;
    while (!this.connections.get(tenantId)?.stopped) {
      try {
        await this.connectAndWatch(tenantId, cfg);
        attempt = 0; // conexión limpia — resetear backoff
      } catch (err) {
        attempt++;
        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
          RECONNECT_MAX_DELAY_MS,
        );
        this.logger.error(
          `[tenant ${tenantId}] conexión IMAP caída (intento ${attempt}): ${(err as Error).message}. Reintentando en ${delay}ms.`,
        );
        await this.sleep(delay);
      }
    }
  }

  private async connectAndWatch(
    tenantId: string,
    cfg: ImapIntakeConfig,
  ): Promise<void> {
    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port ?? 993,
      secure: cfg.secure ?? true,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false,
    });

    const entry = this.connections.get(tenantId);
    if (entry) entry.client = client;

    await client.connect();
    this.logger.log(`[tenant ${tenantId}] IMAP conectado (${cfg.host}).`);

    const mailbox = cfg.folder ?? 'INBOX';
    const lock = await client.getMailboxLock(mailbox);
    try {
      // Reconciliación: procesa TODO lo no leído antes de esperar mensajes
      // nuevos — cubre correos llegados mientras el proceso estaba caído.
      await this.processUnseen(tenantId, client, cfg);

      while (!this.connections.get(tenantId)?.stopped) {
        if (cfg.pollIntervalMs) {
          await this.sleep(cfg.pollIntervalMs);
        } else {
          await client.idle();
        }
        await this.processUnseen(tenantId, client, cfg);
      }
    } finally {
      lock.release();
      try {
        await client.logout();
      } catch {
        // conexión ya pudo haberse caído; no hay nada más que limpiar.
      }
    }
  }

  private async processUnseen(
    tenantId: string,
    client: ImapFlow,
    cfg: ImapIntakeConfig,
  ): Promise<void> {
    const uids = await client.search({ seen: false }, { uid: true });
    if (!uids || uids.length === 0) return;
    for (const uid of uids) {
      const msg = await client.fetchOne(
        String(uid),
        { source: true, uid: true },
        { uid: true },
      );
      if (!msg) continue;
      await this.handleMessage(tenantId, client, cfg, msg);
    }
  }

  private async handleMessage(
    tenantId: string,
    client: ImapFlow,
    cfg: ImapIntakeConfig,
    msg: FetchMessageObject,
  ): Promise<void> {
    const parsed = await simpleParser(msg.source as Buffer);
    const messageId =
      parsed.messageId ?? `no-message-id-uid-${msg.uid}@${cfg.host}`;

    const already = await this.intake.findOne({
      where: { tenantId, messageId },
    });
    if (already) {
      await this.markSeenAndMove(client, msg.uid, cfg, already.movedToFolder);
      return;
    }

    const from = parsed.from?.value?.[0]?.address ?? '';
    const subject = parsed.subject ?? '(sin asunto)';
    const body = parsed.text ?? parsed.html?.toString() ?? '';
    const attachments: ClassificationAttachment[] = (
      parsed.attachments ?? []
    ).map((a) => ({
      filename: a.filename ?? 'archivo',
      mimeType: a.contentType,
    }));

    let category: EmailIntakeRoute = 'unknown';
    let confidence = 0;
    let provider = 'rules';
    let status: EmailIntakeStatus = 'processed';
    let resultRef: string | null = null;
    let errorMessage: string | null = null;

    try {
      const senderDomain = (from.split('@')[1] ?? '').toLowerCase().trim();
      const knownClient = senderDomain
        ? await this.clients.findOne({
            where: { email: ILike(`%@${senderDomain}`), tenantId },
          })
        : null;

      const classifier = await this.classifiers.resolve(tenantId);
      const classification = await classifier.classify({
        from,
        subject,
        body,
        attachments,
        knownClient: knownClient
          ? { isActive: knownClient.isActive, name: knownClient.name }
          : null,
      });
      category = classification.category;
      confidence = classification.confidence;
      provider = classification.provider;

      switch (category) {
        case 'quote_request': {
          const result = await this.callRequestScoped(
            tenantId,
            QuotesService,
            (svc) => svc.processIncomingEmail({ from, subject, body, messageId }),
          );
          resultRef = result.quote?.id ?? result.emailId ?? null;
          break;
        }
        case 'purchase_order': {
          const result = await this.callRequestScoped(
            tenantId,
            PurchaseOrdersService,
            (svc) =>
              svc.processIncomingEmail({
                from,
                subject,
                body,
                attachments,
                messageId,
              }),
          );
          resultRef = result.poDocument?.id ?? null;
          break;
        }
        default: {
          // 'carrier' | 'comex' | 'unknown': todavía no existe un flujo
          // automatizado para estas categorías (COMEX arranca después de
          // cerrar RC1) — se deja auditado y marcado explícitamente para
          // seguimiento manual, nunca se descarta en silencio.
          status = 'skipped';
          await this.callRequestScoped(tenantId, WorkflowAuditService, (svc) =>
            svc.log({
              workflowName: 'email-intake',
              action: `email_${category}_sin_flujo_automatico`,
              entityType: 'email',
              entityId: messageId,
              inputData: { from, subject },
              outputData: { category, confidence, provider },
            }),
          );
        }
      }
    } catch (err) {
      status = 'failed';
      errorMessage = (err as Error).message;
      this.logger.error(
        `[tenant ${tenantId}] error procesando correo ${messageId} (${category}): ${errorMessage}`,
      );
    }

    await this.intake
      .createQueryBuilder()
      .insert()
      .into(EmailIntakeMessage)
      .values({
        tenantId,
        messageId,
        imapUid: String(msg.uid),
        folder: cfg.folder ?? 'INBOX',
        from,
        subject,
        attachmentCount: attachments.length,
        classificationCategory: category,
        classificationConfidence: confidence,
        classificationProvider: provider,
        status,
        resultRef,
        errorMessage,
        movedToFolder: cfg.processedFolder ?? 'Procesados',
      })
      .orIgnore()
      .execute();

    await this.markSeenAndMove(
      client,
      msg.uid,
      cfg,
      cfg.processedFolder ?? 'Procesados',
    );
  }

  private async markSeenAndMove(
    client: ImapFlow,
    uid: number,
    cfg: ImapIntakeConfig,
    targetFolder: string | null,
  ): Promise<void> {
    try {
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    } catch (err) {
      this.logger.warn(`No se pudo marcar \\Seen uid=${uid}: ${(err as Error).message}`);
    }
    if (!targetFolder) return;
    try {
      await client.messageMove(String(uid), targetFolder, { uid: true });
    } catch (err) {
      // La carpeta puede no existir todavía en el buzón real — no debe tumbar
      // el conector; el correo queda \Seen en INBOX, que ya evita reproceso.
      this.logger.warn(
        `No se pudo mover uid=${uid} a "${targetFolder}": ${(err as Error).message}`,
      );
    }
  }

  /**
   * Resuelve un provider request-scoped (QuotesService/PurchaseOrdersService/
   * WorkflowAuditService dependen transitivamente de TenantContext) fuera de
   * cualquier request HTTP, fijando el tenant manualmente antes de invocarlo.
   * Mismo patrón usado en los tests e2e de idempotencia de RC1 Sprint 4.
   */
  private async callRequestScoped<TInstance, R>(
    tenantId: string,
    type: new (...args: unknown[]) => TInstance,
    fn: (instance: TInstance) => Promise<R>,
  ): Promise<R> {
    const contextId = ContextIdFactory.create();
    const tenantCtx = await this.moduleRef.resolve(
      TenantContext,
      contextId,
      { strict: false },
    );
    tenantCtx.setContext(tenantId, null, false);
    const instance = await this.moduleRef.resolve<TInstance>(
      type,
      contextId,
      { strict: false },
    );
    return fn(instance);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
