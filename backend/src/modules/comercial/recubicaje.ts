/**
 * Recubicaje (Hernán, 6-nov-2026): si en cualquier línea la cantidad recubicada sube o baja MÁS del 10 % frente a la de la
 * Proforma, el pedido queda en excepción en "cubicada" esperando la revisión de Customer Service.
 */
export const UMBRAL_RECUBICAJE_PCT = 10;

export interface LineaRecubicaje {
  n: number;
  antes: number;
  despues: number;
  /** Variación en %: positiva si sube, negativa si baja. */
  pct: number;
}

export function evaluarRecubicaje(
  lineas: Array<{ n: number; kilos: number | null }>,
  nuevos: Array<{ n: number; kilos: number }>,
): { lineas: LineaRecubaje[]; fuera: LineaRecubicaje[]; error?: string } {
  const out: LineaRecubicaje[] = [];
  for (const x of nuevos) {
    const l = lineas.find((y) => y.n === x.n);
    if (!l) return { lineas: [], fuera: [], error: `No existe la línea ${x.n}.` };
    if (!(typeof x.kilos === 'number' && Number.isFinite(x.kilos) && x.kilos >= 0)) return { lineas: [], fuera: [], error: `Línea ${x.n}: los kilos recubicados deben ser un número mayor o igual a 0.` };
    if (!l.kilos || l.kilos <= 0) return { lineas: [], fuera: [], error: `Línea ${x.n}: la Proforma no tiene kilos con los que comparar.` };
    const pct = Math.round(((x.kilos - l.kilos) / l.kilos) * 1000) / 10;
    out.push({ n: x.n, antes: l.kilos, despues: x.kilos, pct });
  }
  return { lineas: out, fuera: out.filter((l) => Math.abs(l.pct) > UMBRAL_RECUBICAJE_PCT) };
}

type LineaRecubaje = LineaRecubicaje;
