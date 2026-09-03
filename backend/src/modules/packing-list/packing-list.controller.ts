import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { renderPackingListEmail } from './packing-list-email.template';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';

class SendPackingListDto {
  // Opcional: si no viene, se resuelve con la lista de distribución asociada
  // a 'document'+'packing_list' (ver DistributionListsService). Si tampoco
  // hay ninguna configurada, se rechaza en vez de adivinar un destinatario.
  @IsOptional()
  @IsEmail()
  to?: string;
}

/**
 * Lista de empaque REAL, consultada en vivo al ERP de Oben
 * (APIConsultaParadixe / spPackingListUSA_Paradixe) para una orden de venta
 * que YA EXISTE en su sistema. Deliberadamente NO genera una lista de
 * empaque a partir de nuestras Órdenes internas: no tenemos peso, lote,
 * dimensiones ni código de barra reales de cada rollo — inventar esos datos
 * para un documento de embarque real sería fabricar información, no
 * automatizarla. Cuando exista un vínculo real entre nuestra Orden y el
 * número de orden de Oben, este mismo endpoint podrá recibirlo automático.
 */
@UseGuards(JwtAuthGuard)
@Controller('packing-list')
export class PackingListController {
  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    private readonly distributionLists: DistributionListsService,
  ) {}

  @Get(':numberOrderSales')
  async getByOrderNumber(@Param('numberOrderSales') numberOrderSales: string) {
    const n = this.parseOrderNumber(numberOrderSales);
    const result = await this.fetchPackingList(n);
    return result;
  }

  @Post(':numberOrderSales/send')
  async sendByEmail(
    @Param('numberOrderSales') numberOrderSales: string,
    @Body() dto: SendPackingListDto,
  ) {
    const n = this.parseOrderNumber(numberOrderSales);
    // Se vuelve a consultar en vivo en vez de confiar en datos que el
    // cliente pudiera mandar en el body — el correo siempre sale con lo que
    // hoy dice el ERP real de Oben, nunca con algo cacheado o manipulable.
    const data = await this.fetchPackingList(n);
    const { subject, html } = renderPackingListEmail(n, data as Record<string, unknown>);

    // Si no se manda un destinatario explícito, se resuelve con la lista de
    // distribución asociada a 'document'+'packing_list'. Sin destinatario
    // explícito NI lista configurada, se rechaza — nunca se inventa a quién
    // mandarlo.
    let to = dto.to;
    let cc: string[] = [];
    if (!to) {
      const resolved = await this.distributionLists.resolveRecipients('document', 'packing_list');
      if (resolved.to.length === 0) {
        throw new BadRequestException(
          'No se indicó destinatario y no hay ninguna lista de distribución asociada a "packing_list". Configúrala en Listas de Distribución o escribe el correo manualmente.',
        );
      }
      // El primer "to" de la lista es el destinatario principal; el resto
      // (si hay más de uno marcado "to") entra como copia junto con los "cc".
      const [primaryTo, ...restTo] = resolved.to;
      to = primaryTo;
      cc = [...restTo, ...resolved.cc];
    }

    const sendResult = await this.hub.call<{ id: string }>(
      'email',
      'send',
      { to, ...(cc.length ? { cc: cc.join(',') } : {}), subject, body: html },
      { maxAttempts: 1, timeoutMs: 30_000 },
    );

    await this.audit.log({
      workflowName: 'packing-list',
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'email_sent',
      entityType: 'packing_list',
      entityId: String(n),
      actorId: this.ctx.userId,
      outputData: { to, cc, ok: sendResult.ok, messageId: sendResult.data?.id ?? null },
      reason: sendResult.ok ? null : sendResult.error,
    });

    if (!sendResult.ok) {
      throw new BadRequestException(sendResult.error ?? 'No se pudo enviar el correo');
    }
    return { sent: true, to, cc };
  }

  private parseOrderNumber(raw: string): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('numberOrderSales debe ser un número de orden de Oben válido');
    }
    return n;
  }

  private async fetchPackingList(numberOrderSales: number): Promise<unknown> {
    const result = await this.hub.call('obenCostOrder', 'query.run', {
      procedure: 'spPackingListUSA_Paradixe',
      numberOrderSales,
    });
    if (!result.ok) {
      throw new BadRequestException(result.error ?? 'No se pudo consultar la lista de empaque en Oben');
    }
    return result.data;
  }
}
