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
 * fabrican. El .xlsx generado es genérico (no replica pixel a pixel la
 * plantilla legada de Oben en Business/ — eso queda pendiente como
 * refinamiento visual una vez se prioricé).
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

    const results = await Promise.all(
      OBEN_REPORTS.map(async (def) => {
        try {
          const data = await this.fetchReport(def.procedure, n);
          const buffer = await this.excel.build(def.label, n, data, def.format);
          return { def, ok: true as const, buffer };
        } catch (err) {
          return { def, ok: false as const, error: (err as Error).message };
        }
      }),
    );
    const included = results.filter((r) => r.ok) as Array<{ def: (typeof OBEN_REPORTS)[number]; ok: true; buffer: Buffer }>;
    const failed = results.filter((r) => !r.ok) as Array<{ def: (typeof OBEN_REPORTS)[number]; ok: false; error: string }>;

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

    const includedListHtml = included.map((r) => `<li>${r.def.label}</li>`).join('');
    const failedListHtml = failed.length
      ? `<p>No se pudieron incluir (${failed.length}): ${failed.map((r) => r.def.label).join(', ')}.</p>`
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
          filename: `${r.def.label.replace(/\s+/g, '_')}-OV${n}.xlsx`,
          content: r.buffer.toString('base64'),
          encoding: 'base64',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
        included: included.map((r) => r.def.key),
        failed: failed.map((r) => ({ key: r.def.key, error: r.error })),
        messageId: sendResult.data?.id ?? null,
      },
      reason: sendResult.ok ? null : sendResult.error,
    });

    if (!sendResult.ok) {
      throw new BadRequestException(sendResult.error ?? 'No se pudo enviar el correo');
    }
    return {
      sent: true,
      to,
      cc,
      included: included.map((r) => r.def.key),
      failed: failed.map((r) => ({ key: r.def.key, error: r.error })),
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

  private async fetchReport(procedure: string, numberOrderSales: number): Promise<unknown> {
    const result = await this.hub.call('obenCostOrder', 'query.run', { procedure, numberOrderSales });
    if (!result.ok) {
      throw new BadRequestException(result.error ?? 'No se pudo consultar el reporte en Oben');
    }
    return result.data;
  }
}
