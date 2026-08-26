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
import { FreightRateImportService } from '../freight-rates/freight-rate-import.service';

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
/** Ver nota en `withWatchdog` — un STATUS real tarda ~150-200ms; 20s da margen de sobra sin dejar un socket muerto colgado por mucho tiempo. */
const WATCHDOG_MS = 20_000;
/** Ver nota en `connectAndWatch` — mitigación mientras se identifica la causa raíz exacta del sondeo que deja de detectar correo sin error ni cuelgue. */
const MAX_CONNECTION_AGE_MS = 10 * 60_000;

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
    private readonly freightRates: FreightRateImportService,
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

    // CRÍTICO: 'error' es un evento especial en EventEmitter — sin un
    // listener, Node lo relanza como excepción no capturada y TUMBA TODO
    // EL PROCESO (no solo esta conexión). imapflow emite 'error' en el
    // socket ante cualquier hipo de red (timeout, reset, desconexión por
    // inactividad) — algo esperable en una conexión de horas, no una
    // condición excepcional. Encontrado en vivo el 2026-08-26: el backend
    // completo se reiniciaba cada pocos minutos por esto, perdiendo el
    // estado del conector a mitad de procesar un correo (que quedaba
    // marcado \Seen por el fetch pero nunca escrito en la base de datos).
    client.on('error', (err: Error) => {
      this.logger.error(
        `[tenant ${tenantId}] error de socket IMAP (no fatal, reconecta solo): ${err.message}`,
      );
    });

    const entry = this.connections.get(tenantId);
    if (entry) entry.client = client;

    await client.connect();
    this.logger.log(`[tenant ${tenantId}] IMAP conectado (${cfg.host}).`);

    const mailbox = cfg.folder ?? 'INBOX';
    const lock = await client.getMailboxLock(mailbox);
    try {
      // Primera activación de este tenant+carpeta: NO se procesa el
      // historial completo del buzón (podrían ser miles de correos reales
      // ya existentes, como en una cuenta personal/empresarial en uso) —
      // se marca como "línea base" todo lo anterior a este momento y solo
      // se procesa lo que llegue de aquí en adelante.
      await this.seedWatermarkIfFirstRun(tenantId, mailbox, client);

      // Reconciliación: procesa lo pendiente desde el último UID conocido
      // — cubre correos llegados mientras el proceso estaba caído.
      await this.withWatchdog(this.processUnseen(tenantId, client, cfg), 'processUnseen (inicial)');

      const connectedAt = Date.now();
      while (
        !this.connections.get(tenantId)?.stopped &&
        Date.now() - connectedAt < MAX_CONNECTION_AGE_MS
      ) {
        if (cfg.pollIntervalMs) {
          await this.sleep(cfg.pollIntervalMs);
        } else {
          await client.idle();
        }
        // Encontrado en vivo el 2026-08-26: tras ~40min corriendo, el ciclo
        // de sondeo se quedó colgado sin ningún log ni evento 'error' — un
        // socket "medio muerto" (NAT/firewall cortando una conexión larga
        // sin avisar) hace que el próximo comando IMAP nunca reciba
        // respuesta ni error, solo se queda esperando para siempre. El
        // listener de 'error' (arriba) no ayuda aquí porque no es un error,
        // es silencio total. Un watchdog con timeout es la única forma de
        // detectar esto y forzar una reconexión real.
        await this.withWatchdog(this.processUnseen(tenantId, client, cfg), 'processUnseen');
      }
      // Segunda variante del mismo problema, encontrada en vivo horas
      // después: la conexión NO se cuelga (el watchdog de arriba no
      // dispara), pero deja de detectar correo nuevo de todas formas —
      // sospecha: el proveedor empieza a limitar/cachear respuestas de
      // STATUS ante sondeo tan frecuente (cada 5s, cientos de veces en una
      // hora) sin pasar nunca por IDLE. No se identificó la causa exacta
      // todavía; como mitigación mientras tanto, se fuerza una reconexión
      // completa cada MAX_CONNECTION_AGE_MS pase lo que pase — una conexión
      // nueva siempre reporta el estado correcto (confirmado en vivo).
    } finally {
      lock.release();
      try {
        await this.withWatchdog(client.logout(), 'logout');
      } catch {
        // conexión ya pudo haberse caído (o el watchdog la dio por muerta);
        // no hay nada más que limpiar.
      }
    }
  }

  /** Si `promise` no resuelve en `PROCESS_WATCHDOG_MS`, la deja colgada y sigue —
   *  lanza para que `runForTenant` reconecte desde cero (ver nota arriba). */
  private async withWatchdog<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `watchdog: "${label}" sin respuesta tras ${WATCHDOG_MS}ms — conexión probablemente muerta, forzando reconexión`,
            ),
          ),
        WATCHDOG_MS,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  /**
   * Descubrimiento por UID, NO por la bandera \Seen. Encontrado en vivo el
   * 2026-08-26: cualquier OTRO cliente con acceso al mismo buzón (webmail,
   * móvil, un script de diagnóstico) puede marcar un correo como leído antes
   * de que este conector lo vea — con `search({seen:false})` ese correo
   * quedaría perdido para siempre, sin ningún error. El "watermark" (UID más
   * alto ya registrado en `email_intake_messages` para este tenant+carpeta)
   * es la fuente de verdad real, independiente de qué more toque la bandeja.
   * La deduplicación por Message-ID en `handleMessage` sigue siendo la
   * barrera principal; esto solo corrige el paso de *descubrimiento*.
   *
   * `client.mailbox.uidNext` NO sirve para esto fuera del momento del SELECT
   * inicial: encontrado en vivo el mismo día — imapflow solo actualiza ese
   * campo cacheado durante el SELECT/mailboxOpen; ni NOOP ni las respuestas
   * recibidas en IDLE lo refrescan (solo `.exists`), así que con sondeo por
   * `pollIntervalMs` (sleep, sin IDLE) quedaba congelado en el valor de la
   * conexión y ningún correo llegado después se detectaba jamás. Se pide un
   * STATUS real en cada ciclo para tener el valor vigente del servidor.
   */
  private async processUnseen(
    tenantId: string,
    client: ImapFlow,
    cfg: ImapIntakeConfig,
  ): Promise<void> {
    const folder = cfg.folder ?? 'INBOX';
    // Diagnóstico temporal (2026-08-26): el watchdog de 20s en connectAndWatch
    // no ha disparado ni una vez pese a ciclos que llevan 30+ min sin avanzar
    // — hay que ver en qué línea exacta se queda colgado la próxima vez, en
    // vez de seguir adivinando. Quitar una vez identificada la causa raíz.
    this.logger.debug(`[tenant ${tenantId}] processUnseen: pidiendo status()...`);
    const status = await client.status(folder, { uidNext: true });
    this.logger.debug(`[tenant ${tenantId}] processUnseen: status() OK, uidNext=${status.uidNext}`);
    const uidNext = status.uidNext;
    if (!uidNext) return;

    const watermark = await this.getWatermarkUid(tenantId, folder);
    this.logger.debug(`[tenant ${tenantId}] processUnseen: watermark=${watermark}`);
    if (uidNext - 1 <= watermark) return; // nada nuevo desde el último procesado

    const range = `${watermark + 1}:${uidNext - 1}`;
    this.logger.debug(`[tenant ${tenantId}] processUnseen: fetch range=${range}...`);
    for await (const msg of client.fetch(
      range,
      { source: true, uid: true },
      { uid: true },
    )) {
      this.logger.debug(`[tenant ${tenantId}] processUnseen: msg uid=${msg.uid} recibido, procesando...`);
      await this.handleMessage(tenantId, client, cfg, msg);
      this.logger.debug(`[tenant ${tenantId}] processUnseen: msg uid=${msg.uid} manejado.`);
    }
    this.logger.debug(`[tenant ${tenantId}] processUnseen: fetch range=${range} terminado.`);
  }

  /**
   * Si nunca se ha procesado nada para este tenant+carpeta, deja una fila
   * "línea base" marcando el UID más alto que YA existía en el buzón al
   * momento de activar el conector, para que la primera reconciliación no
   * intente procesar años de correo histórico real como si fuera nuevo.
   */
  private async seedWatermarkIfFirstRun(
    tenantId: string,
    folder: string,
    client: ImapFlow,
  ): Promise<void> {
    const existing = await this.intake
      .createQueryBuilder('e')
      .where('e.tenant_id = :tenantId', { tenantId })
      .andWhere('e.folder = :folder', { folder })
      .getCount();
    if (existing > 0) return;

    const uidNext = client.mailbox ? client.mailbox.uidNext : undefined;
    const baselineUid = uidNext && uidNext > 1 ? uidNext - 1 : 0;
    if (baselineUid <= 0) return; // buzón vacío — nada que proteger

    await this.intake
      .createQueryBuilder()
      .insert()
      .into(EmailIntakeMessage)
      .values({
        tenantId,
        messageId: `__baseline__${folder}`,
        imapUid: String(baselineUid),
        folder,
        from: 'sistema@oben-plus.local',
        subject: 'Línea base — inicio del conector de correo real',
        attachmentCount: 0,
        classificationCategory: null,
        classificationConfidence: null,
        classificationProvider: null,
        status: 'skipped',
        resultRef: null,
        errorMessage: null,
        movedToFolder: null,
      })
      .orIgnore()
      .execute();

    this.logger.log(
      `[tenant ${tenantId}] primera activación del conector en "${folder}" — se ignora el historial previo (hasta UID ${baselineUid}), solo se procesa correo nuevo desde ahora.`,
    );
  }

  private async getWatermarkUid(
    tenantId: string,
    folder: string,
  ): Promise<number> {
    const row = await this.intake
      .createQueryBuilder('e')
      .select('MAX(CAST(e.imap_uid AS BIGINT))', 'max')
      .where('e.tenant_id = :tenantId', { tenantId })
      .andWhere('e.folder = :folder', { folder })
      .getRawOne<{ max: string | null }>();
    return row?.max ? Number(row.max) : 0;
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
        case 'freight_rates': {
          // Maestro de tarifas de flete (WO-018) — NO es una solicitud de
          // cotización de cliente, es una actualización periódica que envía
          // el forwarder de Oben. Reemplaza el maestro completo del tenant.
          const rateAttachment = (parsed.attachments ?? []).find((a) =>
            /\.xlsx?$/i.test(a.filename ?? ''),
          );
          if (!rateAttachment) {
            status = 'skipped';
            errorMessage =
              'Clasificado como freight_rates pero sin adjunto .xlsx/.xls reconocible';
            break;
          }
          const sourceFile = rateAttachment.filename ?? 'archivo-tarifas.xlsx';
          const workbook = this.freightRates.parseWorkbook(
            rateAttachment.content as Buffer,
          );
          const importResult = await this.freightRates.replaceAll(
            tenantId,
            sourceFile,
            workbook,
          );
          resultRef = `inland:${importResult.inlandCount} transload:${importResult.transloadCount} recargos:${importResult.surchargeCount}`;
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
