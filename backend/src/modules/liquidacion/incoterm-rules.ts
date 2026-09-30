export type ConceptoLiquidacion = 'flete' | 'seguro' | 'otrosGastos';

/**
 * Qué conceptos pide la liquidación según el Incoterm — José Guzmán, llamada
 * del 2026-09-30 (DAP/DDP y FCA/FOB) y WhatsApp del mismo día para CFR/CPT:
 * "solo se pide FLETE" (en la llamada lo había dicho de dos formas).
 *
 * Un Incoterm que no esté aquí (EXW, CIF, CIP, DPU...) no tiene regla
 * definida por Oben: bloquea la liquidación en vez de suponer una.
 */
export const CONCEPTOS_POR_INCOTERM: Readonly<Record<string, readonly ConceptoLiquidacion[]>> = {
  DAP: ['flete', 'seguro', 'otrosGastos'],
  DDP: ['flete', 'seguro', 'otrosGastos'],
  CFR: ['flete'],
  CPT: ['flete'],
  FCA: [],
  FOB: [],
};

/** " cfr Callao" → "CFR". */
export function normalizarIncoterm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().toUpperCase().match(/^[A-Z]{3}\b/);
  return m ? m[0] : null;
}

/** null = Incoterm ausente o sin regla definida por Oben. */
export function conceptosDe(incoterm: string | null): readonly ConceptoLiquidacion[] | null {
  return (incoterm && CONCEPTOS_POR_INCOTERM[incoterm]) || null;
}

/** Un monto digitado (flete, otros gastos): número finito, no negativo. */
export const esMonto = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * El "Valor de la póliza" es un divisor (FOB inicial = Subtotal ÷ póliza,
 * seguro = Subtotal − FOB inicial), así que solo tiene sentido mayor a 1
 * (p. ej. 1.0035 ≈ 0.35%). Con ≤ 1 el seguro saldría 0 o negativo.
 */
export const esFactorPoliza = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 1;
