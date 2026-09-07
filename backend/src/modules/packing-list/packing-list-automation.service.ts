import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { ObenReportExcelService } from '../oben-reports/oben-report-excel.service';
import { SolefilmesPdfService } from '../oben-reports/solefilmes-pdf.service';

/**
 * Dispara la generación y el envío de la Lista de Empaque automáticamente
 * cuando llega el correo real de Oben "OV [n] Aprobada En Corte" (ver
 * ImapConnectorService) — sin intervención humana, tal como lo describió
 * José el 2026-09-07.
 *
 * Regla de negocio confirmada por José: TODOS los clientes reciben la Lista
 * de Empaque en Excel (spPackingListUSA_Paradixe) salvo Solefilmes, que
 * ADEMÁS recibe el PDF con código de barras real (spEmpaqueSolefilmes_Paradixe,
 * formato "Shipment Traceability" — ver SolefilmesPdfService). Se decide
 * mirando el campo `Cliente` que ya trae la respuesta real de Oben — nunca
 * una lista de clientes hardcodeada aparte, que podría desactualizarse.
 */
@Injectable()
export class PackingListAutomationService {
  private readonly logger = new Logger(PackingListAutomationService.name);

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    private readonly distributionLists: DistributionListsService,
    private readonly excel: ObenReportExcelService,
    private readonly solefilmesPdf: SolefilmesPdfService,
  ) {}

  async handleOvApproved(numberOrderSales: number): Promise<{ sent: boolean; client: string; format: 'excel' | 'pdf' }> {
    const packingListResult = await this.hub.call('obenCostOrder', 'query.run', {
      procedure: 'spPackingListUSA_Paradixe',
      numberOrderSales,
    });
    if (!packingListResult.ok) {
      throw new BadRequestException(
        packingListResult.error ?? `No se pudo consultar la lista de empaque de la orden ${numberOrderSales}`,
      );
    }
    const packingData = packingListResult.data as Record<string, unknown>;
    const cliente = String(packingData.Cliente ?? '');
    const isSolefilmes = /solefilm/i.test(cliente);

    let buffer: Buffer;
    let filename: string;
    let contentType: string;
    let format: 'excel' | 'pdf';

    if (isSolefilmes) {
      const soleResult = await this.hub.call('obenCostOrder', 'query.run', {
        procedure: 'spEmpaqueSolefilmes_Paradixe',
        numberOrderSales,
      });
      if (!soleResult.ok) {
        throw new BadRequestException(
          soleResult.error ?? `No se pudo consultar el empaque de Solefilmes de la orden ${numberOrderSales}`,
        );
      }
      buffer = await this.solefilmesPdf.build(soleResult.data as never);
      filename = `Shipment_Traceability-OV${numberOrderSales}.pdf`;
      contentType = 'application/pdf';
      format = 'pdf';
    } else {
      buffer = await this.excel.build('Lista de Empaque', numberOrderSales, packingData, 'packing_list');
      filename = `Lista_de_Empaque-OV${numberOrderSales}.xlsx`;
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      format = 'excel';
    }

    const resolved = await this.distributionLists.resolveRecipients('document', 'packing_list');
    if (resolved.to.length === 0) {
      await this.audit.log({
        workflowName: 'packing-list-automation',
        eventType: WorkflowEventType.ACTION_EXECUTED,
        action: 'ov_approved_sin_lista_distribucion',
        entityType: 'packing_list',
        entityId: String(numberOrderSales),
        actorId: this.ctx.userId,
        outputData: { cliente, format },
        reason:
          'El documento se generó correctamente pero no se envió: no hay ninguna lista de distribución asociada a "packing_list". Configúrala en Listas de Distribución.',
      });
      throw new BadRequestException(
        'No hay ninguna lista de distribución asociada a "packing_list" — el documento se generó pero no se pudo enviar.',
      );
    }
    const [primaryTo, ...restTo] = resolved.to;
    const cc = [...restTo, ...resolved.cc];

    const sendResult = await this.hub.call<{ id: string }>(
      'email',
      'send',
      {
        to: primaryTo,
        ...(cc.length ? { cc: cc.join(',') } : {}),
        subject: `Lista de Empaque — Orden ${numberOrderSales}${isSolefilmes ? ' (Solefilmes)' : ''}`,
        body: `<p>Adjunto la lista de empaque de la orden ${numberOrderSales}, generada automáticamente al recibir la aprobación de corte, con datos consultados en vivo al sistema real de Oben.</p>`,
        attachments: [
          {
            filename,
            content: buffer.toString('base64'),
            encoding: 'base64',
            contentType,
          },
        ],
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
      outputData: { to: primaryTo, cc, cliente, format, ok: sendResult.ok, messageId: sendResult.data?.id ?? null },
      reason: sendResult.ok ? null : sendResult.error,
    });

    if (!sendResult.ok) {
      throw new BadRequestException(sendResult.error ?? 'No se pudo enviar el correo');
    }

    this.logger.log(`Orden ${numberOrderSales} (${cliente}): lista de empaque generada en ${format} y enviada.`);
    return { sent: true, client: cliente, format };
  }
}
