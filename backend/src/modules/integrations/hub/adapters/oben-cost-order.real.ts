import { Injectable } from '@nestjs/common';
import { RealAdapterBase } from '../real-adapter-base';
import { AdapterCapability, BaseAdapterConfig } from '../adapter.types';

export interface ObenCostOrderAdapterConfig extends BaseAdapterConfig {
  /** URL de APICostOrderParadixe (costo de orden de venta por línea). */
  baseUrl?: string;
  /** URL de APIConsultaParadixe (endpoint genérico multi-SP, WO-018). */
  consultaUrl?: string;
  authToken?: string;
}

/**
 * Familia de APIs reales de Oben (api.obengroup.co), comparten `Authtoken`:
 *
 *  - `costOrder.get` → APICostOrderParadixe: costo de una orden de venta por
 *    línea. Parámetros de negocio (`NumberOrderSales`, `Linea`) van como
 *    headers, no query/body — confirmado en vivo el 2026-08-18.
 *  - `query.run` → APIConsultaParadixe: endpoint GENÉRICO agregado por Oben
 *    el 2026-08-24 a propuesta de Paradixe, para no tener que construir un
 *    adapter por cada uno de los ~8 stored procedures de solo consulta
 *    (spConsumoME_Paradixe, spConsumoMP_Paradixe, spPackingListUSA_Paradixe,
 *    spEmpaqueUnificada_Paradixe, spEmpaqueDetallada_Paradixe,
 *    spCheckSettlement_Paradixe, spChecLinea_Paradixe,
 *    spEmpaqueSolefilmes_Paradixe): se manda el nombre del SP
 *    (`NombreConsulta`) + el valor del parámetro (`NumberOrderSales`, el
 *    mismo header sin importar cómo se llame el parámetro real del SP en el
 *    lado de Oben) y devuelve el JSON de ese SP. Confirmado en vivo con 2 SPs
 *    distintos el 2026-08-24. Las 3 transacciones (`spApproveComex_Paradixe`,
 *    `spSettlement_Head`, `spSettlement_Detail`) NO entran en este genérico
 *    — tienen parámetros propios y siguen pendientes como adapters/endpoints
 *    dedicados si Oben decide construirlos así.
 *
 * Ninguna encaja en GenericHttpRealAdapter (auth por header propio, params
 * de negocio también como headers en vez de query/body). `httpJson()`
 * (heredado de RealAdapterBase) trae la protección SSRF y el timeout
 * uniforme del resto del hub.
 */
@Injectable()
export class ObenCostOrderRealAdapter extends RealAdapterBase {
  readonly system = 'obenCostOrder';

  constructor(private readonly cfg: ObenCostOrderAdapterConfig) {
    super(cfg);
  }

  capabilities(): AdapterCapability[] {
    return [
      {
        operation: 'costOrder.get',
        method: 'read',
        description: 'Costo de una orden de venta por línea (API real Oben)',
      },
      {
        operation: 'query.run',
        method: 'read',
        description:
          'Ejecuta cualquiera de los stored procedures de consulta de Oben por nombre (API real Oben)',
      },
    ];
  }

  protected requiredConfigFields(): string[] {
    // authToken es común a toda la familia; baseUrl/consultaUrl se validan
    // por operación abajo, porque cada una usa un endpoint distinto.
    return ['authToken'];
  }

  protected operationHandlers() {
    return {
      'costOrder.get': (args: Record<string, unknown>) =>
        this.getCostOrder(args),
      'query.run': (args: Record<string, unknown>) => this.runQuery(args),
    };
  }

  private async getCostOrder(
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.assertConfigured();
    if (!this.cfg.baseUrl) {
      throw new Error('pending_credentials: falta baseUrl (APICostOrderParadixe)');
    }
    const numberOrderSales = args.numberOrderSales;
    const linea = args.linea;
    if (numberOrderSales === undefined || numberOrderSales === null) {
      throw new Error('BUSINESS_ERROR: numberOrderSales requerido');
    }
    if (linea === undefined || linea === null) {
      throw new Error('BUSINESS_ERROR: linea requerido');
    }

    return this.httpJson(this.cfg.baseUrl, { method: 'POST' }, {
      Authtoken: this.cfg.authToken!,
      NumberOrderSales: String(numberOrderSales),
      Linea: String(linea),
    });
  }

  private async runQuery(args: Record<string, unknown>): Promise<unknown> {
    this.assertConfigured();
    if (!this.cfg.consultaUrl) {
      throw new Error('pending_credentials: falta consultaUrl (APIConsultaParadixe)');
    }
    const procedure = args.procedure;
    const numberOrderSales = args.numberOrderSales;
    if (!procedure || typeof procedure !== 'string') {
      throw new Error('BUSINESS_ERROR: procedure requerido (nombre del stored procedure)');
    }
    if (numberOrderSales === undefined || numberOrderSales === null) {
      throw new Error('BUSINESS_ERROR: numberOrderSales requerido');
    }

    return this.httpJson(this.cfg.consultaUrl, { method: 'POST' }, {
      Authtoken: this.cfg.authToken!,
      NombreConsulta: procedure,
      NumberOrderSales: String(numberOrderSales),
    });
  }
}
