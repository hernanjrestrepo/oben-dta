import { Injectable } from '@nestjs/common';
import { RealAdapterBase } from '../real-adapter-base';
import { AdapterCapability, BaseAdapterConfig } from '../adapter.types';

export interface ObenCostOrderAdapterConfig extends BaseAdapterConfig {
  /** URL de APICostOrderParadixe (costo de orden de venta por línea). */
  baseUrl?: string;
  /** URL de APIConsultaParadixe (endpoint genérico multi-SP, WO-018). */
  consultaUrl?: string;
  /** URL de APICrearEncLiqParadixe (crea el encabezado de una liquidación). */
  crearEncLiqUrl?: string;
  /** URL de APICrearDetLiqParadixe (crea una línea de detalle de liquidación). */
  crearDetLiqUrl?: string;
  /** URL de APILiquidacionParadixe (consulta/dispara la liquidación por NumberPF). */
  liquidacionUrl?: string;
  authToken?: string;
}

/**
 * Toma solo las claves de `args` que estén presentes (no `undefined`) y las
 * castea a string para ir como header — igual que el resto del adapter. No
 * se inventan valores por defecto para campos de negocio (montos, códigos):
 * si el llamador no los manda, no se envían, y es la API real de Oben la que
 * decide si eso es válido o no.
 */
function pickHeaders(
  args: Record<string, unknown>,
  keys: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [argKey, headerName] of Object.entries(keys)) {
    const value = args[argKey];
    if (value !== undefined && value !== null) {
      headers[headerName] = String(value);
    }
  }
  return headers;
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
 *  - `liquidacion.crearEncabezado` → APICrearEncLiqParadixe (`spSettlement_Head`):
 *    crea el encabezado de una liquidación de comercio exterior para un
 *    `NumberPF`. Credenciales entregadas por Oben el 2026-08-30.
 *  - `liquidacion.crearDetalle` → APICrearDetLiqParadixe (`spSettlement_Detail`):
 *    crea una línea de detalle (valores/costos) de una liquidación ya
 *    encabezada, referenciada por `CodSecInvoiceDataComexHead`.
 *  - `liquidacion.consultar` → APILiquidacionParadixe: consulta/dispara la
 *    liquidación de un `NumberPF`.
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
      {
        operation: 'liquidacion.crearEncabezado',
        method: 'write',
        description: 'Crea el encabezado de una liquidación de comercio exterior (API real Oben)',
      },
      {
        operation: 'liquidacion.crearDetalle',
        method: 'write',
        description: 'Crea una línea de detalle de una liquidación ya encabezada (API real Oben)',
      },
      {
        operation: 'liquidacion.consultar',
        method: 'read',
        description: 'Consulta/dispara la liquidación de un NumberPF (API real Oben)',
      },
    ];
  }

  protected requiredConfigFields(): string[] {
    // authToken es común a toda la familia; baseUrl/consultaUrl/las 3 URLs
    // de liquidación se validan por operación abajo, porque cada una usa un
    // endpoint distinto.
    return ['authToken'];
  }

  protected operationHandlers() {
    return {
      'costOrder.get': (args: Record<string, unknown>) =>
        this.getCostOrder(args),
      'query.run': (args: Record<string, unknown>) => this.runQuery(args),
      'liquidacion.crearEncabezado': (args: Record<string, unknown>) =>
        this.crearEncabezadoLiquidacion(args),
      'liquidacion.crearDetalle': (args: Record<string, unknown>) =>
        this.crearDetalleLiquidacion(args),
      'liquidacion.consultar': (args: Record<string, unknown>) =>
        this.consultarLiquidacion(args),
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

  private async crearEncabezadoLiquidacion(
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.assertConfigured();
    if (!this.cfg.crearEncLiqUrl) {
      throw new Error('pending_credentials: falta crearEncLiqUrl (APICrearEncLiqParadixe)');
    }
    if (args.numberPF === undefined || args.numberPF === null) {
      throw new Error('BUSINESS_ERROR: numberPF requerido');
    }

    return this.httpJson(this.cfg.crearEncLiqUrl, { method: 'POST' }, {
      Authtoken: this.cfg.authToken!,
      NumberPF: String(args.numberPF),
      ...pickHeaders(args, {
        direccion: 'Direccion',
        notes: 'Notes',
        paNcm: 'PaNcm',
        paNaladi: 'PaNaladi',
        description: 'Description',
        puertoArribo: 'PuertoArribo',
        puertoEmbarque: 'PuertoEmbarque',
        inlandFreight: 'InlandFreight',
        entryFee: 'EntryFee',
        importerSecurityFiling: 'ImporterSecurityFiling',
        // El nombre real del header en la API de Oben trae este typo
        // ("Maintenamce" en vez de "Maintenance") — confirmado en la
        // colección de Postman que entregó Oben el 2026-08-30, no es un
        // error nuestro.
        harborMaintenanceFee: 'HarborMaintenamceFee',
        destinationCharges: 'DestinationCharges',
      }),
    });
  }

  private async crearDetalleLiquidacion(
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.assertConfigured();
    if (!this.cfg.crearDetLiqUrl) {
      throw new Error('pending_credentials: falta crearDetLiqUrl (APICrearDetLiqParadixe)');
    }
    if (
      args.codSecInvoiceDataComexHead === undefined ||
      args.codSecInvoiceDataComexHead === null
    ) {
      throw new Error('BUSINESS_ERROR: codSecInvoiceDataComexHead requerido (referencia al encabezado)');
    }

    return this.httpJson(this.cfg.crearDetLiqUrl, { method: 'POST' }, {
      Authtoken: this.cfg.authToken!,
      ...pickHeaders(args, {
        kilosTotal: 'KilosTotal',
        kilosTotalUnit: 'KilosTotalUnit',
        valueTotal: 'ValueTotal',
        valueFreight: 'ValueFreight',
        valueFreightUnit: 'ValueFreightUnit',
        subTotal: 'SubTotal',
        valueSure: 'ValueSure',
        valueSureUnit: 'ValueSureUnit',
        valueFOB: 'ValueFOB',
        expensesOther: 'ExpensesOther',
        expensesOtherUnit: 'ExpensesOtherUnit',
        total: 'Total',
        totalUnidad: 'TotalUnidad',
        codSecInvoiceDataComexHead: 'CodSecInvoiceDataComexHead',
        codSecPoliza: 'CodSecPoliza',
        codSecLineFilm: 'CodSecLineFilm',
      }),
    });
  }

  private async consultarLiquidacion(
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.assertConfigured();
    if (!this.cfg.liquidacionUrl) {
      throw new Error('pending_credentials: falta liquidacionUrl (APILiquidacionParadixe)');
    }
    if (args.numberPF === undefined || args.numberPF === null) {
      throw new Error('BUSINESS_ERROR: numberPF requerido');
    }

    return this.httpJson(this.cfg.liquidacionUrl, { method: 'POST' }, {
      Authtoken: this.cfg.authToken!,
      NumberPF: String(args.numberPF),
    });
  }
}
