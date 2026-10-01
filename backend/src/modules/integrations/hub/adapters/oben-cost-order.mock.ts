import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/** En el simulador, Proforma = Orden de venta + este desfase (biyectivo: Liquidación resuelve el país desde la OV). */
const PF_OFFSET = 200;
const PAISES_DEMO = ['USA', 'COLOMBIA', 'ECUADOR', 'COLOMBIA', 'MEXICO'];
const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Mock de APICostOrderParadixe — misma forma de respuesta que la API real
 * (ver oben-cost-order.real.ts), con datos ficticios, para demo/QA sin
 * tocar el sistema real de Oben. Expone las MISMAS 5 operaciones que el
 * adapter real (antes le faltaban las 3 de Liquidación y la Empaque
 * Unificada no traía País ni Proforma, así que ni Liquidación ni Facturación
 * de Exportación podían recorrerse completas en dev/demo).
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
      {
        operation: 'query.run',
        method: 'read',
        description: 'Ejecuta un stored procedure de consulta de Oben por nombre (mock)',
      },
      {
        operation: 'liquidacion.crearEncabezado',
        method: 'write',
        description: 'Crea el encabezado de liquidación (spSettlement_Head) — mock, no escribe nada real',
      },
      {
        operation: 'liquidacion.crearDetalle',
        method: 'write',
        description: 'Crea una línea de detalle de liquidación (spSettlement_Detail) — mock, no escribe nada real',
      },
      {
        operation: 'liquidacion.consultar',
        method: 'read',
        description: 'Consulta la liquidación de una Proforma (spCheckSettlement) — mock',
      },
      {
        operation: 'factura.crear',
        method: 'write',
        description: 'Crea la factura de una proforma (APICrearInvoiceParadixe) — mock, no factura nada real',
      },
    ];
  }

  protected operationHandlers() {
    return {
      'costOrder.get': this.wrap(
        (args) => this.getCostOrder(args),
        'costOrder.get',
      ),
      'query.run': this.wrap((args) => this.runQuery(args), 'query.run'),
      'liquidacion.crearEncabezado': this.wrap((args) => this.crearEncabezado(args), 'liquidacion.crearEncabezado'),
      'liquidacion.crearDetalle': this.wrap((args) => this.crearDetalle(args), 'liquidacion.crearDetalle'),
      'liquidacion.consultar': this.wrap((args) => this.consultarLiquidacion(args), 'liquidacion.consultar'),
      'factura.crear': this.wrap(async (args) => {
        const pf = String((args.numberPF as string | number | undefined) ?? '');
        if (!/^\d+$/.test(pf)) throw new Error('BUSINESS_ERROR: numberPF requerido (numérico)');
        const dist = String((args.numberDistribucion as string | number | undefined) ?? '');
        return { isSuccessful: true, Code: '200', message: `SIMULADO: factura ${dist ? `parcial (distribución ${dist})` : 'completa'} de la PF ${pf}` };
      }, 'factura.crear'),
    };
  }

  /** Datos demo deterministas por Orden de venta: la misma OV siempre simula el mismo pedido. */
  private demoOrder(numberOrderSales: number) {
    const h = createHash('sha256').update(`obenCostOrder|${numberOrderSales}`).digest();
    const pais = PAISES_DEMO[h[0] % PAISES_DEMO.length];
    const lineas = 1 + (h[1] % 2);
    return {
      pais,
      cliente: `Cliente Demo Oben (${pais})`,
      proforma: String(numberOrderSales + PF_OFFSET),
      ordenCompra: `OC-DEMO-${numberOrderSales}`,
      detalle: Array.from({ length: lineas }, (_, i) => ({
        CodSed_LineFilm: 100 + i,
        TipoPelicula: i === 0 ? 'SC---0015TN' : 'ENA--0012TM',
        Precio: 2.5 + (h[2 + i] % 50) / 100,
        KilosTotales: 1000 + (h[4 + i] % 200) * 10,
      })),
    };
  }

  /** Rollos simulados de la OV (2 estibas × 3 rollos por línea), coherentes con demoOrder. */
  private demoRollos(numberOrderSales: number) {
    const o = this.demoOrder(numberOrderSales);
    return o.detalle.flatMap((l, i) => {
      const ancho = 425 + i * 75;
      const netoRollo = redondear(l.KilosTotales / 6);
      return Array.from({ length: 6 }, (_, k) => {
        const pallet = `PAL-SIM-${numberOrderSales}-${i + 1}${Math.floor(k / 3) + 1}`;
        const brutoPaleta = redondear(netoRollo * 3 + 25);
        return {
          PO: o.ordenCompra,
          CodigoInternacional: `INT-${l.TipoPelicula}`,
          Descripcion: `${l.TipoPelicula} (SIMULADO)`,
          CodigoItem: l.TipoPelicula,
          Producto: 'PELÍCULA SIMULADA',
          Tratamiento: 'UN LADO',
          NroUnico: `R-SIM-${numberOrderSales}-${i + 1}${String(k + 1).padStart(2, '0')}`,
          CodigoBarraPallet: pallet,
          Ancho: ancho,
          WidthIn: redondear(ancho / 25.4),
          ODmm: 600,
          ODin: redondear(600 / 25.4),
          LongMt: 6000,
          LengthFt: redondear(6000 * 3.28084),
          Lote: `LOTE-SIM-${numberOrderSales}`,
          BobinaPesoNetoKg: netoRollo,
          RollNetWeightLb: redondear(netoRollo * 2.20462),
          PesoNetoKg: netoRollo,
          PesoNetoLb: redondear(netoRollo * 2.20462),
          PesoBrutoKg: redondear(netoRollo + 3),
          PesoBrutoLb: redondear((netoRollo + 3) * 2.20462),
          PaletaPesoNetoKg: redondear(netoRollo * 3),
          PalletNetWeightLb: redondear(netoRollo * 3 * 2.20462),
          PaletaPesoBrutoKg: brutoPaleta,
          PalletGrossWeightLb: redondear(brutoPaleta * 2.20462),
          Bobinas: 3,
        };
      });
    });
  }

  private consultarLiquidacion(args: Record<string, unknown>) {
    const numberPF = Number(args.numberPF);
    if (args.numberPF === undefined || args.numberPF === null || !Number.isFinite(numberPF)) {
      throw new Error('BUSINESS_ERROR: numberPF requerido');
    }
    const ov = numberPF - PF_OFFSET;
    const o = this.demoOrder(ov);
    return {
      Proforma: String(numberPF),
      OrdenVenta: String(ov),
      OrdenCompra: o.ordenCompra,
      Cliente: o.cliente,
      Detalle: o.detalle,
    };
  }

  private crearEncabezado(args: Record<string, unknown>) {
    if (args.numberPF === undefined || args.numberPF === null) {
      throw new Error('BUSINESS_ERROR: numberPF requerido');
    }
    return { CodSec_InvoiceDataComexHead: 50_000 + (Number(args.numberPF) % 10_000) };
  }

  private crearDetalle(args: Record<string, unknown>) {
    if (args.codSecInvoiceDataComexHead === undefined || args.codSecInvoiceDataComexHead === null) {
      throw new Error('BUSINESS_ERROR: codSecInvoiceDataComexHead requerido (referencia al encabezado)');
    }
    return 'OK';
  }

  private runQuery(args: Record<string, unknown>) {
    const procedure = args.procedure;
    const numberOrderSales = args.numberOrderSales;
    if (!procedure || typeof procedure !== 'string') {
      throw new Error('BUSINESS_ERROR: procedure requerido (nombre del stored procedure)');
    }
    if (numberOrderSales === undefined || numberOrderSales === null) {
      throw new Error('BUSINESS_ERROR: numberOrderSales requerido');
    }
    if (procedure === 'spEmpaqueUnificada_Paradixe') {
      const ov = Number(numberOrderSales);
      const o = this.demoOrder(ov);
      return {
        Fecha: new Date().toISOString().slice(0, 10),
        Cliente: o.cliente,
        Pais: o.pais,
        OrdenVenta: String(ov),
        Proforma: o.proforma,
        OrdenCompra: o.ordenCompra,
        Contenedor: `DEMO${String(ov).padStart(7, '0')}`,
        CodigoMaterial: o.detalle[0].TipoPelicula,
        Detalle: o.detalle.map((l) => ({ TipoPelicula: l.TipoPelicula, KilosTotales: l.KilosTotales })),
      };
    }
    // Resto del paquete de la Lista de Empaque, con la forma real de cada SP
    // (ver ObenReportExcelService). Todo rotulado SIMULADO: nunca es de Oben.
    if (procedure === 'spChecLinea_Paradixe') {
      return this.demoOrder(Number(numberOrderSales)).detalle.map((_, i) => ({ Linea: i + 1 }));
    }
    if (procedure === 'spPackingListUSA_Paradixe') {
      const ov = Number(numberOrderSales);
      const o = this.demoOrder(ov);
      return {
        Fecha: new Date().toISOString().slice(0, 10),
        Cliente: o.cliente,
        Almacen: 'BODEGA SIMULADA',
        OC_Cliente: o.ordenCompra,
        Documento: o.proforma,
        Contenedor: `DEMO${String(ov).padStart(7, '0')}`,
        Numero: String(ov),
        Local: 'PLANTA SIMULADA',
        DetailedPackingList: this.demoRollos(ov),
      };
    }
    if (procedure === 'spEmpaqueDetallada_Paradixe') {
      const ov = Number(numberOrderSales);
      const o = this.demoOrder(ov);
      const rollos = this.demoRollos(ov);
      const pallets = [...new Set(rollos.map((r) => r.CodigoBarraPallet))];
      return {
        Fecha: new Date().toISOString().slice(0, 10),
        Cliente: o.cliente,
        Pais: o.pais,
        Proforma: o.proforma,
        OrdenCompra: o.ordenCompra,
        Contenedor: `DEMO${String(ov).padStart(7, '0')}`,
        CodigoMaterial: o.detalle[0].TipoPelicula,
        TotalPallet: pallets.length,
        TotalBobinas: rollos.length,
        TotalPesoNetoKg: redondear(rollos.reduce((a, r) => a + r.BobinaPesoNetoKg, 0)),
        TotalPesoBrutoKg: redondear(rollos.reduce((a, r) => a + r.PesoBrutoKg, 0)),
        Detalle1: pallets.map((codigo) => ({
          Codigo: codigo,
          TipoPallet: 'ESTIBA DE MADERA (SIMULADA)',
          Detalle2: rollos
            .filter((r) => r.CodigoBarraPallet === codigo)
            .map((r) => ({
              CodigoInterno: r.NroUnico,
              TipoPelicula: r.CodigoItem,
              AnchoMm: r.Ancho,
              AnchoIn: r.WidthIn,
              PesoNetoKg: r.BobinaPesoNetoKg,
              PesoNetoLb: r.RollNetWeightLb,
              PesoBrutoKg: r.PesoBrutoKg,
              PesoBrutoLb: r.PesoBrutoLb,
              Metraje: r.LongMt,
              MetrajeFt: r.LengthFt,
              Lote: r.Lote,
              FabricacionMFG: new Date().toISOString().slice(0, 10),
              Empalmes: 0,
            })),
        })),
      };
    }
    if (procedure === 'spConsumoME_Paradixe') {
      const ov = Number(numberOrderSales);
      const o = this.demoOrder(ov);
      const rollos = this.demoRollos(ov);
      return {
        Fecha: new Date().toISOString().slice(0, 10),
        Cliente: o.cliente,
        OrdenVenta: String(ov),
        Detalle1: o.detalle.map((l) => {
          const propios = rollos.filter((r) => r.CodigoItem === l.TipoPelicula);
          return {
            Pelicula: l.TipoPelicula,
            Detalle2: [
              { Material: 'CORE 6" (SIMULADO)', Cantidad: propios.length, Observacion: '' },
              { Material: 'ESTIBA DE MADERA (SIMULADA)', Cantidad: new Set(propios.map((r) => r.CodigoBarraPallet)).size, Observacion: '' },
              { Material: 'STRETCH FILM kg (SIMULADO)', Cantidad: redondear(propios.length * 0.35), Observacion: '' },
            ],
          };
        }),
      };
    }
    if (procedure === 'spConsumoMP_Paradixe') {
      const ov = Number(numberOrderSales);
      const o = this.demoOrder(ov);
      return {
        Fecha: new Date().toISOString().slice(0, 10),
        Cliente: o.cliente,
        OrdenVenta: String(ov),
        Detalle: o.detalle.flatMap((l) => [
          { Pelicula: l.TipoPelicula, PesoPelicula: l.KilosTotales, Material: 'MP-SIM-01', NombreMaterial: 'RESINA BASE (SIMULADA)', Cantidad: redondear(l.KilosTotales * 0.94), Porcentaje: 94 },
          { Pelicula: l.TipoPelicula, PesoPelicula: l.KilosTotales, Material: 'MP-SIM-02', NombreMaterial: 'ADITIVO (SIMULADO)', Cantidad: redondear(l.KilosTotales * 0.06), Porcentaje: 6 },
        ]),
      };
    }
    return {
      Fecha: new Date().toISOString().slice(0, 10),
      Cliente: 'Cliente Demo Oben',
      OrdenVenta: String(numberOrderSales),
      Procedure: procedure,
      Detalle: [
        { Campo: 'demo', Valor: `${procedure}-mock` },
      ],
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
