import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';

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
  constructor(private readonly hub: IntegrationHubService) {}

  @Get(':numberOrderSales')
  async getByOrderNumber(@Param('numberOrderSales') numberOrderSales: string) {
    const n = Number(numberOrderSales);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('numberOrderSales debe ser un número de orden de Oben válido');
    }
    const result = await this.hub.call('obenCostOrder', 'query.run', {
      procedure: 'spPackingListUSA_Paradixe',
      numberOrderSales: n,
    });
    if (!result.ok) {
      throw new BadRequestException(result.error ?? 'No se pudo consultar la lista de empaque en Oben');
    }
    return result.data;
  }
}
