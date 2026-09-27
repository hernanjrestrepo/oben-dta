import type { LiquidacionHeaderValues, LiquidacionLineValues } from './liquidacion.types';

export const LIQUIDACION_VALUE_CALCULATOR = Symbol('LIQUIDACION_VALUE_CALCULATOR');

/** `LIQUIDACION_SIMULATION_MODE=true` → fórmula SIMULADA (solo dev/demo). Ausente en producción. */
export const LIQUIDACION_SIMULATION_ENV = 'LIQUIDACION_SIMULATION_MODE';

export interface LiquidacionLineContext {
  pais: string | null;
  esUSA: boolean;
  header: LiquidacionHeaderValues;
  line: { codSecLineFilm: number; tipoPelicula: string; precio: number; kilosTotal: number; valueFOB: number };
  /** Suma de FOB de todas las líneas de la PF (para prorrateos). */
  totalFOB: number;
  totalKilos: number;
}

/**
 * Punto de extensión para la fórmula por Incoterm que tiene José (flete,
 * seguro, otros gastos, Total, TotalUnidad y sus versiones por unidad). Esa
 * fórmula NO está escrita en ninguna parte de nuestros datos todavía (se le
 * pidió el Excel el 2026-09-23). Cuando llegue, se agrega un calculador real
 * con `simulated = false` y se inyecta con el mismo token — sin tocar
 * LiquidacionService.
 */
export interface LiquidacionValueCalculator {
  /**
   * true = los valores NO son reales. LiquidacionService lo propaga a
   * `LiquidacionDraft.simulated` y rechaza cualquier envío real
   * (`confirm:true`) de un borrador simulado.
   */
  readonly simulated: boolean;
  compute(ctx: LiquidacionLineContext): LiquidacionLineValues;
}

/** Producción hoy: no calcula nada — flete/seguro/otros gastos quedan como faltantes y bloquean el envío. */
export class PendingFormulaCalculator implements LiquidacionValueCalculator {
  readonly simulated = false;

  compute(): LiquidacionLineValues {
    return {};
  }
}

/**
 * Tarifas de EJEMPLO para la fórmula simulada. NO son tarifas de Oben ni de
 * ningún forwarder: solo existen para poder probar el flujo completo de
 * Liquidación → Facturación en dev/demo mientras llega la fórmula de José.
 */
export const SIMULATED_INCOTERM_RATES = {
  /** Flete internacional de ejemplo, USD por kg. */
  fletePorKgUSD: 0.12,
  /** Seguro de ejemplo sobre (FOB + flete). */
  seguroPct: 0.003,
  /** Gastos de origen de ejemplo sobre el FOB, para destinos distintos de USA. */
  otrosGastosPct: 0.01,
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Fórmula de Incoterm SIMULADA (estructura tipo CIF + gastos de destino):
 *  - flete   = kilos × fletePorKgUSD (+ Inland Freight de USA prorrateado por kilos)
 *  - seguro  = seguroPct × (FOB + flete)
 *  - otros   = USA: Entry Fee + ISF + Harbor + Destination Charges (valores del
 *              encabezado, que sí vienen del maestro real de tarifas o del
 *              usuario) prorrateados por FOB; resto: otrosGastosPct × FOB
 *  - subtotal = FOB + flete + seguro; total = subtotal + otros
 *  - "por unidad" = por kg (la semántica exacta de "por unidad" también es
 *    una pregunta abierta para José).
 *
 * Si un cargo de USA del encabezado falta, `otros` no se calcula (queda como
 * faltante): la simulación reemplaza la FÓRMULA, no los datos de entrada.
 *
 * Candado: `simulated = true` → LiquidacionService nunca deja que un borrador
 * armado con esta fórmula llegue a un `submit({confirm:true})` real.
 */
export class SimulatedIncotermCalculator implements LiquidacionValueCalculator {
  readonly simulated = true;

  compute({ esUSA, header, line, totalFOB, totalKilos }: LiquidacionLineContext): LiquidacionLineValues {
    const { kilosTotal: kilos, valueFOB: fob } = line;
    if (!(kilos > 0) || !(fob >= 0) || !(totalKilos > 0)) return {};
    const r = SIMULATED_INCOTERM_RATES;

    const inland = esUSA && isNum(header.inlandFreight) ? header.inlandFreight * (kilos / totalKilos) : 0;
    const flete = round2(kilos * r.fletePorKgUSD + inland);
    const seguro = round2((fob + flete) * r.seguroPct);

    let otros: number | undefined;
    if (esUSA) {
      const cargos = [header.entryFee, header.importerSecurityFiling, header.harborMaintenanceFee, header.destinationCharges];
      if (cargos.every(isNum) && totalFOB > 0) {
        otros = round2(cargos.reduce((a, b) => a + b, 0) * (fob / totalFOB));
      }
    } else {
      otros = round2(fob * r.otrosGastosPct);
    }

    const subTotal = round2(fob + flete + seguro);
    const values: LiquidacionLineValues = {
      kilosTotalUnit: 1,
      valueFreight: flete,
      valueFreightUnit: round4(flete / kilos),
      valueSure: seguro,
      valueSureUnit: round4(seguro / kilos),
      subTotal,
    };
    if (otros !== undefined) {
      const total = round2(subTotal + otros);
      Object.assign(values, {
        expensesOther: otros,
        expensesOtherUnit: round4(otros / kilos),
        valueTotal: total,
        total,
        totalUnidad: round4(total / kilos),
      });
    }
    return values;
  }
}

/** Qué calculador inyectar según el entorno — ver LiquidacionModule. */
export function calculatorFromEnv(env: NodeJS.ProcessEnv = process.env): LiquidacionValueCalculator {
  return env[LIQUIDACION_SIMULATION_ENV] === 'true' ? new SimulatedIncotermCalculator() : new PendingFormulaCalculator();
}
