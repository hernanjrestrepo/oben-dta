import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { DistributionListsService, ResolvedRecipients } from '../distribution-lists/distribution-lists.service';
import { ObenReportsService, DocumentPackageResult, PackageFailure } from '../oben-reports/oben-reports.service';
import { PackingListPendingRetry } from '../../entities/packing-list-pending-retry.entity';
import { PACKING_LIST_RETRY_INTERVAL_MS } from './packing-list-retry.constants';

export interface HandleOvApprovedResult {
  sent: boolean;
  queued: boolean;
  client: string;
  included: string[];
  failed: string[];
  /**
   * Solo presente cuando `sendCompletePackage` no pudo enviar el correo
   * (el paquete SÍ estaba completo — la falla fue de transporte, ej. un
   * timeout de SMTP). El llamador debe tratarlo igual que un paquete
   * incompleto: encolar para reintento, nunca devolver `sent:true` a medias.
   */
  sendFailure?: PackageFailure;
}

/**
 * Dispara la generación y el envío de TODOS los documentos de una orden
 * automáticamente cuando llega el correo real de Oben "OV [n] Aprobada En
 * Corte" (ver ImapConnectorService) — sin intervención humana, tal como lo
 * describió José el 2026-09-07.
 *
 * Simplificado el 2026-09-11: antes este servicio armaba su propia "Lista de
 * Empaque" (spPackingListUSA_Paradixe, un solo archivo) y le sumaba el resto
 * del conjunto de documentos por separado. Ahora que ObenReportsService ya
 * arma la "Lista Especial" (3 hojas, ver ObenReportExcelService) y la "Hoja
 * de Costos" como parte del mismo conjunto, este servicio solo pide UN
 * paquete completo y lo manda en un solo correo — ya no necesita consultar
 * Oben ni generar documentos por su cuenta.
 *
 * Regla agregada el 2026-09-14 (pedido explícito del usuario, tras 2 correos
 * reales enviados incompletos — OV 11094, 11064): NUNCA se manda el correo de
 * Lista de Empaque con documentos faltantes. Si algo falla, la orden se
 * encola (`PackingListPendingRetry`) para que `PackingListRetryProcessorService`
 * la reintente cada 10 minutos hasta 5 veces; si sigue incompleta, se escala
 * por correo a José Guzmán (copia Jorge Restrepo) en vez de seguir en
 * silencio. El reintento corre en un proceso de fondo aparte — a propósito,
 * para no bloquear el conector IMAP con una espera de hasta 50 minutos (el
 * mismo tipo de problema que causó el bug de correos duplicados del
 * 2026-09-11: procesamiento largo corriendo dentro del ciclo de correo).
 */
@Injectable()
export class PackingListAutomationService {
  private readonly logger = new Logger(PackingListAutomationService.name);

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    private readonly distributionLists: DistributionListsService,
    private readonly reports: ObenReportsService,
    @InjectRepository(PackingListPendingRetry)
    private readonly retries: Repository<PackingListPendingRetry>,
  ) {}

  async handleOvApproved(numberOrderSales: number): Promise<HandleOvApprovedResult> {
    const resolved = await this.distributionLists.resolveRecipients('document', 'packing_list');
    if (resolved.to.length === 0) {
      await this.audit.log({
        workflowName: 'packing-list-automation',
        eventType: WorkflowEventType.ACTION_EXECUTED,
        action: 'ov_approved_sin_lista_distribucion',
        entityType: 'packing_list',
        entityId: String(numberOrderSales),
        actorId: this.ctx.userId,
        outputData: {},
        reason:
          'No hay ninguna lista de distribución asociada a "packing_list" — no se intentó ni generar los documentos.',
      });
      throw new BadRequestException(
        'No hay ninguna lista de distribución asociada a "packing_list" — configúrala en Listas de Distribución.',
      );
    }

    const documentPackage = await this.reports.buildDocumentPackage(numberOrderSales);
    const includedKeys = documentPackage.included.map((r) => r.key);
    const failedKeys = documentPackage.failed.map((r) => r.key);

    if (documentPackage.failed.length > 0) {
      await this.enqueueRetry(numberOrderSales, documentPackage.failed);
      await this.audit.log({
        workflowName: 'packing-list-automation',
        eventType: WorkflowEventType.ACTION_EXECUTED,
        action: 'ov_approved_incompleto_en_cola',
        entityType: 'packing_list',
        entityId: String(numberOrderSales),
        actorId: this.ctx.userId,
        outputData: { cliente: documentPackage.client, included: includedKeys, failed: failedKeys },
        reason: `Faltan ${documentPackage.failed.length} reporte(s) (${failedKeys.join(', ')}) — no se envía nada; se reintentará cada 10 minutos hasta 5 veces antes de escalar.`,
      });
      this.logger.warn(
        `Orden ${numberOrderSales}: incompleta (${failedKeys.join(', ')}) — encolada para reintento en 10 minutos, sin enviar correo.`,
      );
      return { sent: false, queued: true, client: documentPackage.client, included: includedKeys, failed: failedKeys };
    }

    const result = await this.sendCompletePackage(numberOrderSales, documentPackage, resolved);
    if (result.sendFailure) {
      // El paquete SÍ estaba completo — la falla fue de transporte (ej. un
      // timeout de SMTP, encontrado en vivo el 2026-09-17 con la OV 11040:
      // "timeout: sin respuesta de email.send tras 30000ms"). Antes esto
      // lanzaba y el correo se perdía en silencio si no llegaba un segundo
      // disparador real de Oben para la misma orden. Se trata igual que un
      // paquete incompleto: se encola para el mismo ciclo de reintento/
      // escalamiento en vez de perderse.
      await this.enqueueRetry(numberOrderSales, [result.sendFailure]);
      await this.audit.log({
        workflowName: 'packing-list-automation',
        eventType: WorkflowEventType.ACTION_EXECUTED,
        action: 'ov_approved_envio_fallido_en_cola',
        entityType: 'packing_list',
        entityId: String(numberOrderSales),
        actorId: this.ctx.userId,
        outputData: { cliente: documentPackage.client, included: includedKeys },
        reason: `El paquete estaba completo pero el correo no se pudo enviar (${result.sendFailure.error}) — se reintentará cada 10 minutos hasta 5 veces antes de escalar.`,
      });
      this.logger.warn(
        `Orden ${numberOrderSales}: paquete completo pero el envío del correo falló (${result.sendFailure.error}) — encolada para reintento.`,
      );
      return { sent: false, queued: true, client: documentPackage.client, included: includedKeys, failed: [] };
    }
    return result;
  }

  /**
   * Envía el correo real — SOLO se debe llamar cuando `documentPackage.failed`
   * está vacío (ya sea en el primer intento o desde
   * `PackingListRetryProcessorService` tras un reintento exitoso). NUNCA
   * lanza por una falla de envío — la devuelve en `sendFailure` para que el
   * llamador decida (encolar reintento), no para que se pierda en un throw.
   */
  async sendCompletePackage(
    numberOrderSales: number,
    documentPackage: DocumentPackageResult,
    resolved: ResolvedRecipients,
  ): Promise<HandleOvApprovedResult> {
    const includedKeys = documentPackage.included.map((r) => r.key);
    const cliente = documentPackage.client;
    const isSolefilmes = includedKeys.includes('empaque_solefilmes');
    const [primaryTo, ...restTo] = resolved.to;
    const cc = [...restTo, ...resolved.cc];

    const sendResult = await this.hub.call<{ id: string }>(
      'email',
      'send',
      {
        to: primaryTo,
        ...(cc.length ? { cc: cc.join(',') } : {}),
        subject: `Lista de Empaque — Orden ${numberOrderSales}${isSolefilmes ? ' (Solefilmes)' : ''}`,
        body: `<p>Adjuntos los documentos de la orden ${numberOrderSales}, generados automáticamente al recibir la aprobación de corte, con datos consultados en vivo al sistema real de Oben.</p>`,
        attachments: documentPackage.included.map((r) => ({
          filename: r.filename,
          content: r.buffer.toString('base64'),
          encoding: 'base64',
          contentType: r.contentType,
        })),
      },
      { maxAttempts: 1, timeoutMs: 30_000 },
    );

    await this.audit.log({
      workflowName: 'packing-list-automation',
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'ov_approved_lista_empaque_enviada',
      entityType: 'packing_list',
      entityId: String(numberOrderSales),
      actorId: this.ctx.userId,
      outputData: {
        to: primaryTo,
        cc,
        cliente,
        included: includedKeys,
        failed: [],
        ok: sendResult.ok,
        messageId: sendResult.data?.id ?? null,
      },
      reason: sendResult.ok ? null : sendResult.error,
    });

    if (!sendResult.ok) {
      return {
        sent: false,
        queued: false,
        client: cliente,
        included: includedKeys,
        failed: [],
        sendFailure: { key: 'envio_correo', label: 'Envío del correo electrónico', error: sendResult.error ?? 'No se pudo enviar el correo' },
      };
    }

    // Confirma a Oben que ya se generaron los documentos — best effort, no
    // bloquea el correo si falla (ver ObenReportsService.confirmApproveComex).
    await this.reports.confirmApproveComex(numberOrderSales);

    this.logger.log(
      `Orden ${numberOrderSales} (${cliente}): ${includedKeys.length} documentos generados y enviados (${includedKeys.join(', ')}).`,
    );
    return { sent: true, queued: false, client: cliente, included: includedKeys, failed: [] };
  }

  /**
   * Se llama desde `PackingListRetryProcessorService` cuando una orden sigue
   * incompleta tras `PACKING_LIST_RETRY_MAX_ATTEMPTS` intentos (50 minutos) —
   * avisa a un humano en vez de seguir reintentando en silencio para siempre.
   * Best effort respecto al flujo normal: si no hay lista de distribución
   * configurada para el escalamiento, se audita el problema pero no lanza,
   * para no tumbar el procesador de reintentos.
   */
  async sendEscalation(numberOrderSales: number, failed: PackageFailure[]): Promise<void> {
    const resolved = await this.distributionLists.resolveRecipients('document', 'packing_list_escalation');
    if (resolved.to.length === 0) {
      this.logger.error(
        `Orden ${numberOrderSales}: sigue incompleta tras 5 intentos pero no hay lista de distribución "packing_list_escalation" configurada — no se pudo avisar a nadie.`,
      );
      await this.audit.log({
        workflowName: 'packing-list-automation',
        eventType: WorkflowEventType.ACTION_EXECUTED,
        action: 'ov_approved_escalamiento_sin_lista_distribucion',
        entityType: 'packing_list',
        entityId: String(numberOrderSales),
        actorId: this.ctx.userId,
        outputData: { failed: failed.map((f) => f.key) },
        reason: 'No hay ninguna lista de distribución asociada a "packing_list_escalation" — configúrala en Listas de Distribución.',
      });
      return;
    }

    const [primaryTo, ...restTo] = resolved.to;
    const cc = [...restTo, ...resolved.cc];
    const failedListHtml = failed.map((f) => `<li>${f.label}: ${f.error}</li>`).join('');

    const sendResult = await this.hub.call<{ id: string }>(
      'email',
      'send',
      {
        to: primaryTo,
        ...(cc.length ? { cc: cc.join(',') } : {}),
        subject: `Orden ${numberOrderSales} — documentos incompletos tras 5 intentos`,
        body: `<p>La orden ${numberOrderSales} sigue sin poder generar todos sus documentos después de 5 intentos automáticos (uno cada 10 minutos, ~50 minutos en total). No se envió ningún correo de Lista de Empaque para esta orden todavía.</p><p>Reportes que no se pudieron generar:</p><ul>${failedListHtml}</ul><p>¿Nos pueden ayudar a confirmar si esta orden tiene los datos completos en Oben?</p>`,
      },
      { maxAttempts: 1, timeoutMs: 30_000 },
    );

    await this.audit.log({
      workflowName: 'packing-list-automation',
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'ov_approved_escalado_tras_5_intentos',
      entityType: 'packing_list',
      entityId: String(numberOrderSales),
      actorId: this.ctx.userId,
      outputData: {
        to: primaryTo,
        cc,
        failed: failed.map((f) => ({ key: f.key, error: f.error })),
        ok: sendResult.ok,
        messageId: sendResult.data?.id ?? null,
      },
      reason: sendResult.ok ? null : sendResult.error,
    });
  }

  /**
   * Recupera una orden cuyo procesamiento se cortó a mitad de camino (el
   * contenedor se reinició — ver `ImapConnectorService.recoverOrphanedMessages`).
   * Encontrado en vivo el 2026-09-23: un cron externo reiniciaba `dta-backend`
   * cada 2 minutos y las OV 10983 y 11147 quedaron para siempre en
   * 'processing' (el watermark de UID ya las daba por vistas).
   *
   * Anti-duplicado: si desde `since` ya hay un envío real auditado
   * (`ov_approved_lista_empaque_enviada`, se escribe justo después del envío)
   * NO se vuelve a mandar nada. Si no lo hay, el proceso murió ANTES de
   * enviar, así que se encola para el reintento en segundo plano ya (sin los
   * 10 minutos de espera), que arma el paquete completo y lo envía. La única
   * ventana residual es un corte entre el `email.send` y su registro de
   * auditoría — milisegundos, frente a minutos de generación de documentos.
   */
  async recoverInterruptedOv(
    numberOrderSales: number,
    since: Date,
  ): Promise<'already_sent' | 'queued'> {
    const events = await this.audit.listForEntity('packing_list', String(numberOrderSales));
    const alreadySent = events.some(
      (e) => e.action === 'ov_approved_lista_empaque_enviada' && e.createdAt >= since,
    );
    if (alreadySent) return 'already_sent';

    await this.enqueueRetry(
      numberOrderSales,
      [
        {
          key: 'proceso_interrumpido',
          label: 'Procesamiento interrumpido por reinicio del servicio',
          error: 'El proceso se cortó antes de completar el envío — recuperada automáticamente.',
        },
      ],
      0,
    );
    await this.audit.log({
      workflowName: 'packing-list-automation',
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: 'ov_approved_recuperada_tras_reinicio',
      entityType: 'packing_list',
      entityId: String(numberOrderSales),
      actorId: this.ctx.userId,
      outputData: {},
      reason:
        'El procesamiento quedó interrumpido a mitad de camino (reinicio del servicio) y no hay envío registrado — se encoló para generar y enviar el paquete completo.',
    });
    return 'queued';
  }

  private async enqueueRetry(
    numberOrderSales: number,
    failed: PackageFailure[],
    delayMs: number = PACKING_LIST_RETRY_INTERVAL_MS,
  ): Promise<void> {
    const existing = await this.retries.findOne({
      where: { tenantId: this.ctx.tenantId, numberOrderSales, status: 'pending' },
    });
    if (existing) return;
    await this.retries.save(
      this.retries.create({
        tenantId: this.ctx.tenantId,
        numberOrderSales,
        attempts: 0,
        nextRetryAt: new Date(Date.now() + delayMs),
        status: 'pending',
        lastMissing: failed,
      }),
    );
  }
}
