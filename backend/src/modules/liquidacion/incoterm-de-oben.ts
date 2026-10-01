import { normalizarIncoterm } from './incoterm-rules';

/** Reporte de Oben con las proformas y sus órdenes de venta (APIConsultaParadixe). */
export const SP_PROFORMAS_COMEX = 'spCheckSalesOrderComex_Paradixe';

/** Nombres de campo que pueden traer el Incoterm (sin distinguir mayúsculas ni `_`). */
const CAMPO_INCOTERM = /^(incoterms?|terminos?(de)?negociaci[oó]n|terminoincoterm)$/i;

/**
 * El SP devuelve las proformas como objetos separados por comas SIN corchetes
 * ("{...},{...}" — verificado en vivo el 2026-10-01): `httpJson` no lo puede
 * parsear y lo entrega como texto. Acepta texto, arreglo u objeto.
 */
export function parsearProformasComex(data: unknown): Array<Record<string, unknown>> {
  let v: unknown = data;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    try {
      v = JSON.parse(s.startsWith('[') ? s : `[${s}]`);
    } catch {
      return [];
    }
  }
  const rows = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [];
  return rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r));
}

function incotermEn(obj: Record<string, unknown>): string | null {
  for (const [k, val] of Object.entries(obj)) {
    if (CAMPO_INCOTERM.test(k.replace(/[_\s]/g, '')) && typeof val === 'string') {
      const n = normalizarIncoterm(val);
      if (n) return n;
    }
  }
  return null;
}

/** País de destino de la proforma en el mismo reporte (campo "Pais", p. ej. "USA"). */
export function paisDeProforma(data: unknown, numberPF: string): string | null {
  const pf = parsearProformasComex(data).find((r) => String(r.NroProforma ?? r.Proforma ?? '').trim() === numberPF);
  const pais = typeof pf?.Pais === 'string' ? pf.Pais.trim() : '';
  return pais || null;
}

/**
 * Incoterm de una proforma según Oben: en el registro de la proforma o, si
 * no, en sus órdenes de venta (si todas coinciden). José: "la API trae
 * Proforma, cuántas órdenes de venta tiene y qué Incoterm". Al 2026-10-01 el
 * campo aún no viene; cuando aparezca, se toma sin tocar código.
 */
export function incotermDeProforma(data: unknown, numberPF: string): string | null {
  const pf = parsearProformasComex(data).find((r) => String(r.NroProforma ?? r.Proforma ?? '').trim() === numberPF);
  if (!pf) return null;
  const directo = incotermEn(pf);
  if (directo) return directo;
  const ovs = Array.isArray(pf.OrdenesVenta) ? pf.OrdenesVenta : [];
  const deOvs = [...new Set(ovs.filter((o): o is Record<string, unknown> => !!o && typeof o === 'object').map(incotermEn).filter(Boolean))];
  return deOvs.length === 1 ? deOvs[0] : null;
}
