import type { LiquidacionHeaderValues, LiquidacionLineValues } from './liquidacion.types';

export const LIQUIDACION_VALUE_CALCULATOR = Symbol('LIQUIDACION_VALUE_CALCULATOR');

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
 * pidió el Excel el 2026-09-23) — hasta entonces la implementación por
 * defecto no devuelve nada y esos valores quedan como faltantes que bloquean
 * el envío, en vez de adivinarse.
 */
export interface LiquidacionValueCalculator {
  compute(ctx: LiquidacionLineContext): LiquidacionLineValues;
}

export class PendingFormulaCalculator implements LiquidacionValueCalculator {
  compute(): LiquidacionLineValues {
    return {};
  }
}
