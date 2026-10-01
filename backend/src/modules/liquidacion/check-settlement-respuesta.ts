/**
 * APILiquidacionParadixe responde la PF como objeto ({...}) o, desde el
 * 2026-10-01 en producción, dentro de una lista ([{...}]). Se acepta ambos:
 * de la lista se toma la de esa Proforma (o la única).
 */
export function unwrapCheckSettlement(data: unknown, numberPF: string): unknown {
  if (!Array.isArray(data)) return data;
  const objs = data.filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && !Array.isArray(d));
  return objs.find((d) => String(d.Proforma ?? '').trim() === numberPF) ?? (objs.length === 1 ? objs[0] : null);
}
