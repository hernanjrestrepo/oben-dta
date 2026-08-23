import { Inject, Injectable } from '@nestjs/common';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * Mock de APICostOrderParadixe — misma forma de respuesta que la API real
 * (ver oben-cost-order.real.ts), con datos ficticios, para demo/QA sin
 * tocar el sistema real de Oben.
 */
@Injectable()
export class ObenCostOrderMockAdapter extends MockAdapterBase {
  readonly system = 'obenCostOrder';

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      {
        operation: 'costOrder.get',
        method: 'read',
        description: 'Costo de una orden de venta por línea (mock)',
      },
    ];
  }

  protected operationHandlers() {
    return {
      'costOrder.get': this.wrap(
        (args) => this.getCostOrder(args),
        'costOrder.get',
      ),
    };
  }

  private getCostOrder(args: Record<string, unknown>) {
    const numberOrderSales = args.numberOrderSales;
    const linea = args.linea;
    if (numberOrderSales === undefined || numberOrderSales === null) {
      throw new Error('BUSINESS_ERROR: numberOrderSales requerido');
    }
    if (linea === undefined || linea === null) {
      throw new Error('BUSINESS_ERROR: linea requerido');
    }
    return {
      Fecha: new Date().toISOString().slice(0, 10),
      CantidadTotalEnc: 12568.1,
      Referencia: `MOCK-${numberOrderSales}-${linea}`,
      TRM: 3874.32,
      Producto: 'PELÍCULA DE POLIÉSTER BIORIENTADA (mock)',
      Cliente: 'Cliente Demo Oben',
      SumaCostoTotal: 26400.35,
      SumaTotalIVA: 4882.6,
      Detalle: [
        {
          ConceptoPrincipal: '1 MATERIAL DE EMPAQUE',
          ConceptoDetalle: '',
          Nacionalizada: 'SI',
          NombreReferencia: 'Material de empaque demo',
          Cantidad: 10,
          CantidadTotal: 10,
          UMB: 'U',
          CostosUMB: 0,
          CostoTotal: 0,
          BaseCIFIVA: 0,
          TotalIVA: 0,
        },
      ],
    };
  }
}
