import { Injectable } from '@nestjs/common';
import { RealAdapterBase } from '../real-adapter-base';
import { AdapterCapability, BaseAdapterConfig } from '../adapter.types';

export interface ObenCostOrderAdapterConfig extends BaseAdapterConfig {
  /** URL completa del endpoint (una sola operación, sin mapa de rutas). */
  baseUrl?: string;
  authToken?: string;
}

/**
 * API real de Oben para costo de orden de venta por línea
 * (APICostOrderParadixe, https://api.obengroup.co). No encaja en
 * GenericHttpRealAdapter: la autenticación es un header propio (`Authtoken`,
 * no Bearer/ApiKey/Basic) y los parámetros de negocio (`NumberOrderSales`,
 * `Linea`) también van como headers en vez de query/body — confirmado en
 * vivo contra la API real el 2026-08-18 con una colección de Postman de Oben.
 * `httpJson()` (heredado de RealAdapterBase) ya trae la protección SSRF y el
 * timeout uniforme del resto del hub.
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
    ];
  }

  protected requiredConfigFields(): string[] {
    return ['baseUrl', 'authToken'];
  }

  protected operationHandlers() {
    return {
      'costOrder.get': (args: Record<string, unknown>) =>
        this.getCostOrder(args),
    };
  }

  private async getCostOrder(
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.assertConfigured();
    const numberOrderSales = args.numberOrderSales;
    const linea = args.linea;
    if (numberOrderSales === undefined || numberOrderSales === null) {
      throw new Error('BUSINESS_ERROR: numberOrderSales requerido');
    }
    if (linea === undefined || linea === null) {
      throw new Error('BUSINESS_ERROR: linea requerido');
    }

    return this.httpJson(this.cfg.baseUrl!, { method: 'POST' }, {
      Authtoken: this.cfg.authToken!,
      NumberOrderSales: String(numberOrderSales),
      Linea: String(linea),
    });
  }
}
