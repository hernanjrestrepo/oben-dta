import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { ObenReportsService } from '../oben-reports/oben-reports.service';

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
  ) {}

  async handleOvApproved(
    numberOrderSales: number,
  ): Promise<{ sent: boolean; client: string; included: string[]; failed: string[] }> {
    const documentPackage = await this.reports.buildDocumentPackage(numberOrderSales);
    const includedKeys = documentPackage.included.map((r) => r.key);
    const failedKeys = documentPackage.failed.map((r) => r.key);

    if (documentPackage.included.length === 0) {
      throw new BadRequestException(
        documentPackage.failed[0]?.error ?? `No se pudo generar ningún documento para la orden ${numberOrderSales}`,
      );
    }

    const cliente = documentPackage.client;
    const isSolefilmes = includedKeys.includes('empaque_solefilmes');

    const resolved = await this.distributionLists.resolveRecipients('document', 'packing_list');
    if (resolved.to.length === 0) {
      await this.audit.log({
        workflowName: 'packing-list-automation',
        eventType: WorkflowEventType.ACTION_EXECUTED,
        action: 'ov_approved_sin_lista_distribucion',
        entityType: 'packing_list',
        entityId: String(numberOrderSales),
        actorId: this.ctx.userId,
        outputData: { cliente, included: includedKeys, failed: failedKeys },
        reason:
          'Los documentos se generaron correctamente pero no se enviaron: no hay ninguna lista de distribución asociada a "packing_list". Configúrala en Listas de Distribución.',
      });
      throw new BadRequestException(
        'No hay ninguna lista de distribución asociada a "packing_list" — los documentos se generaron pero no se pudieron enviar.',
      );
    }
    const [primaryTo, ...restTo] = resolved.to;
    const cc = [...restTo, ...resolved.cc];

    const failedListHtml = documentPackage.failed.length
      ? `<p>No se pudieron incluir (${documentPackage.failed.length}): ${documentPackage.failed.map((r) => `${r.label} (${r.error})`).join(', ')}.</p>`
      : '';

    const sendResult = await this.hub.call<{ id: string }>(
      'email',
      'send',
      {
        to: primaryTo,
        ...(cc.length ? { cc: cc.join(',') } : {}),
        subject: `Lista de Empaque — Orden ${numberOrderSales}${isSolefilmes ? ' (Solefilmes)' : ''}`,
        body: `<p>Adjuntos los documentos de la orden ${numberOrderSales}, generados automáticamente al recibir la aprobación de corte, con datos consultados en vivo al sistema real de Oben.</p>${failedListHtml}`,
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
        failed: failedKeys,
        ok: sendResult.ok,
        messageId: sendResult.data?.id ?? null,
      },
      reason: sendResult.ok ? null : sendResult.error,
    });

    if (!sendResult.ok) {
      throw new BadRequestException(sendResult.error ?? 'No se pudo enviar el correo');
    }

    // Confirma a Oben que ya se generaron los documentos — best effort, no
    // bloquea el correo si falla (ver ObenReportsService.confirmApproveComex).
    await this.reports.confirmApproveComex(numberOrderSales);

    this.logger.log(
      `Orden ${numberOrderSales} (${cliente}): ${includedKeys.length} documentos generados y enviados (${includedKeys.join(', ')}).`,
    );
    return { sent: true, client: cliente, included: includedKeys, failed: failedKeys };
  }
}
