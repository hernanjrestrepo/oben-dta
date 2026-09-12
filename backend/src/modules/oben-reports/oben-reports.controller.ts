import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { IsEmail, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { ObenReportExcelService } from './oben-report-excel.service';
import { ObenReportsService, OBEN_QUERY_OPTIONS } from './oben-reports.service';
import { OBEN_REPORTS, findObenReport } from './oben-report-registry';

class SendReportDto {
  @IsOptional()
  @IsEmail()
  to?: string;
}

/**
 * Reportes reales de Oben (spConsumoME/MP, EmpaqueUnificada/Detallada,
 * ChecLinea, EmpaqueSolefilmes, CheckSettlement) — mismo mecanismo que Lista
 * de Empaque: se consultan en vivo vía APIConsultaParadixe, nunca se
 * fabrican. Ver ObenReportsService para qué reportes componen el "conjunto
 * de documentos" y sus formatos (EmpaqueSolefilmes va en PDF con código de
 * barras real, no en Excel).
 */
@UseGuards(JwtAuthGuard)
@Controller('oben-reports')
export class ObenReportsController {
  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    private readonly distributionLists: DistributionListsService,
    private readonly excel: ObenReportExcelService,
    private readonly reports: ObenReportsService,
  ) {}

  @Get()
  list() {
    return OBEN_REPORTS.map(({ key, label }) => ({ key, label }));
  }

  /**
   * "Se arma el conjunto de documentos" (José, Oben) — un solo correo con
   * todos los reportes que SÍ se pudieron consultar para esa orden, en vez
   * de mandarlos uno por uno. Un reporte que falle (ej. requiere un
   * parámetro distinto, o Oben no tiene datos aún) no bloquea a los demás:
   * se informa cuál falló en vez de fingir que todo salió bien.
   */
  @Post('package/:numberOrderSales/send')
  async sendPackage(
    @Param('numberOrderSales') numberOrderSales: string,
    @Body() dto: SendReportDto,
  ) {
    const n = this.parseOrderNumber(numberOrderSales);
    const { included, failed } = await this.reports.buildDocumentPackage(n);

    if (included.length === 0) {
      throw new BadRequestException('Ningún reporte pudo consultarse para esta orden — no se envió nada.');
    }

    let to = dto.to;
    let cc: string[] = [];
    if (!to) {
      const resolved = await this.distributionLists.resolveRecipients('document', 'document_package');
      if (resolved.to.length === 0) {
        throw new BadRequestException(
          'No se indicó destinatario y no hay ninguna lista de distribución asociada a "document_package". Configúrala en Listas de Distribución o escribe el correo manualmente.',
        );
      }
      const [primaryTo, ...restTo] = resolved.to;
      to = primaryTo;
      cc = [...restTo, ...resolved.cc];
    }

    const includedListHtml = included.map((r) => `<li>${r.label}</li>`).join('');
    const failedListHtml = failed.length
      ? `<p>No se pudieron incluir (${failed.length}): ${failed.map((r) => r.label).join(', ')}.</p>`
      : '';

    const sendResult = await this.hub.call<{ id: string }>(
      'email',
      'send',
      {
        to,
        ...(cc.length ? { cc: cc.join(',') } : {}),
        subject: `Conjunto de documentos — Orden ${n}`,
        body: `<p>Adjunto el conjunto de documentos de la orden ${n}, consultados en vivo al sistema real de Oben.</p><ul>${includedListHtml}</ul>${failedListHtml}`,
        attachments: included.map((r) => ({
          filename: r.filename,
          content: r.buffer.toString('base64'),
          encoding: 'base64',
          contentType: r.contentType,
        })),
      },
      { maxAttempts: 1, timeoutMs: 30_000 },
    );

    await this.audit.log({
      workflowName: 'oben-reports',
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'document_package_sent',
      entityType: 'oben_report_package',
      entityId: String(n),
      actorId: this.ctx.userId,
      outputData: {
        to,
        cc,
        ok: sendResult.ok,
        included: included.map((r) => r.key),
        failed: failed.map((r) => ({ key: r.key, error: r.error })),
        messageId: sendResult.data?.id ?? null,
      },
      reason: sendResult.ok ? null : sendResult.error,
    });

    if (!sendResult.ok) {
      throw new BadRequestException(sendResult.error ?? 'No se pudo enviar el correo');
    }

    // Confirma a Oben que ya se generaron los documentos — best effort, no
    // bloquea la respuesta si falla (ver ObenReportsService.confirmApproveComex).
    await this.reports.confirmApproveComex(n);

    return {
      sent: true,
      to,
      cc,
      included: included.map((r) => r.key),
      failed: failed.map((r) => ({ key: r.key, error: r.error })),
    };
  }

  @Get(':key/:numberOrderSales')
  async getReport(@Param('key') key: string, @Param('numberOrderSales') numberOrderSales: string) {
    const def = this.requireReport(key);
    const n = this.parseOrderNumber(numberOrderSales);
    return this.fetchReport(def.procedure, n);
  }

  @Get(':key/:numberOrderSales/excel')
  async downloadExcel(
    @Param('key') key: string,
    @Param('numberOrderSales') numberOrderSales: string,
    @Res() res: Response,
  ) {
    const def = this.requireReport(key);
    const n = this.parseOrderNumber(numberOrderSales);
    const data = await this.fetchReport(def.procedure, n);
    const buffer = await this.excel.build(def.label, n, data, def.format);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${def.label.replace(/\s+/g, '_')}-OV${n}.xlsx"`,
    );
    res.send(buffer);
  }

  @Post(':key/:numberOrderSales/send')
  async sendReport(
    @Param('key') key: string,
    @Param('numberOrderSales') numberOrderSales: string,
    @Body() dto: SendReportDto,
  ) {
    const def = this.requireReport(key);
    const n = this.parseOrderNumber(numberOrderSales);
    const data = await this.fetchReport(def.procedure, n);
    const buffer = await this.excel.build(def.label, n, data, def.format);

    let to = dto.to;
    let cc: string[] = [];
    if (!to) {
      const resolved = await this.distributionLists.resolveRecipients('document', key);
      if (resolved.to.length === 0) {
        throw new BadRequestException(
          `No se indicó destinatario y no hay ninguna lista de distribución asociada a "${key}". Configúrala en Listas de Distribución o escribe el correo manualmente.`,
        );
      }
      const [primaryTo, ...restTo] = resolved.to;
      to = primaryTo;
      cc = [...restTo, ...resolved.cc];
    }

    const filename = `${def.label.replace(/\s+/g, '_')}-OV${n}.xlsx`;
    const sendResult = await this.hub.call<{ id: string }>(
      'email',
      'send',
      {
        to,
        ...(cc.length ? { cc: cc.join(',') } : {}),
        subject: `${def.label} — Orden ${n}`,
        body: `<p>Adjunto el reporte "${def.label}" de la orden ${n}, consultado en vivo al sistema real de Oben.</p>`,
        attachments: [
          {
            filename,
            content: buffer.toString('base64'),
            encoding: 'base64',
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ],
      },
      { maxAttempts: 1, timeoutMs: 30_000 },
    );

    await this.audit.log({
      workflowName: 'oben-reports',
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'email_sent',
      entityType: 'oben_report',
      entityId: `${key}:${n}`,
      actorId: this.ctx.userId,
      outputData: { to, cc, ok: sendResult.ok, messageId: sendResult.data?.id ?? null },
      reason: sendResult.ok ? null : sendResult.error,
    });

    if (!sendResult.ok) {
      throw new BadRequestException(sendResult.error ?? 'No se pudo enviar el correo');
    }
    return { sent: true, to, cc };
  }

  private requireReport(key: string) {
    const def = findObenReport(key);
    if (!def) {
      throw new NotFoundException(`Reporte "${key}" no existe`);
    }
    return def;
  }

  private parseOrderNumber(raw: string): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('numberOrderSales debe ser un número de orden de Oben válido');
    }
    return n;
  }

  /**
   * spCheckSettlement_Paradixe usa @NumberPF (Proforma) vía
   * APILiquidacionParadixe, NO @NumberOV vía el endpoint genérico —
   * confirmado por José el 2026-09-10 (documento de APIs/SPs de
   * Liquidación). Antes se llamaba mal (con el número de OV, vía query.run)
   * y siempre fallaba con "sin datos" sin importar la orden. Se resuelve el
   * NumberPF real consultando primero spEmpaqueUnificada_Paradixe (que ya
   * trae el campo "Proforma" para esta orden), en vez de pedirle al
   * llamador que conozca de antemano el número de Proforma.
   */
  private async fetchReport(procedure: string, numberOrderSales: number): Promise<unknown> {
    if (procedure === 'spCheckSettlement_Paradixe') {
      return this.fetchCheckSettlement(numberOrderSales);
    }
    const result = await this.hub.call('obenCostOrder', 'query.run', { procedure, numberOrderSales }, OBEN_QUERY_OPTIONS);
    if (!result.ok) {
      throw new BadRequestException(result.error ?? 'No se pudo consultar el reporte en Oben');
    }
    return result.data;
  }

  private async fetchCheckSettlement(numberOrderSales: number): Promise<unknown> {
    const unificadaResult = await this.hub.call('obenCostOrder', 'query.run', {
      procedure: 'spEmpaqueUnificada_Paradixe',
      numberOrderSales,
    }, OBEN_QUERY_OPTIONS);
    if (!unificadaResult.ok) {
      throw new BadRequestException(unificadaResult.error ?? 'No se pudo resolver la Proforma de esta orden');
    }
    const proforma = (unificadaResult.data as Record<string, unknown> | null)?.Proforma;
    if (!proforma) {
      throw new BadRequestException('La orden no tiene número de Proforma asociado todavía');
    }
    const result = await this.hub.call('obenCostOrder', 'liquidacion.consultar', { numberPF: proforma }, OBEN_QUERY_OPTIONS);
    if (!result.ok) {
      throw new BadRequestException(result.error ?? 'No se pudo consultar la liquidación en Oben');
    }
    return result.data;
  }
}
