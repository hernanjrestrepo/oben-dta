export type ConceptoLiquidacion = 'flete' | 'seguro' | 'otrosGastos';

/**
 * Qué conceptos pide la liquidación según el Incoterm (los 11 de Incoterms
 * 2020 de la ICC, en su orden oficial).
 *
 * - Confirmados por José Guzmán (llamada y WhatsApp del 2026-09-30):
 *   DAP/DDP flete + seguro + otros; CFR/CPT solo flete; FCA/FOB nada.
 * - Resto según la norma (reunión del 2026-10-01: "son estándares a nivel
 *   mundial, nadie tiene que meterle mano"): EXW y FAS como FCA/FOB (el
 *   vendedor no paga transporte principal); CIF/CIP como CFR/CPT más el
 *   seguro, que la norma les exige; DPU como DAP (además descarga en destino).
 *
 * Un código que no sea un Incoterm 2020 bloquea la liquidación en vez de suponer.
 */
export const CONCEPTOS_POR_INCOTERM: Readonly<Record<string, readonly ConceptoLiquidacion[]>> = {
  EXW: [],
  FCA: [],
  FAS: [],
  FOB: [],
  CFR: ['flete'],
  CIF: ['flete', 'seguro'],
  CPT: ['flete'],
  CIP: ['flete', 'seguro'],
  DAP: ['flete', 'seguro', 'otrosGastos'],
  DPU: ['flete', 'seguro', 'otrosGastos'],
  DDP: ['flete', 'seguro', 'otrosGastos'],
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
