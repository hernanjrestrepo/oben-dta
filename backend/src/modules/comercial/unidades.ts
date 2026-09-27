/**
 * Conversiones de unidades de las órdenes de compra (reunión 2026-09-23,
 * 1:07:05–1:08:15): exportación —sobre todo EE. UU.— pide en libras y
 * pulgadas; nacional casi siempre en milímetros, a veces en centímetros.
 * Estas son fórmulas fijas (1 lb = 0,45359237 kg; 1 in = 25,4 mm; 1 mil =
 * 25,4 µm), no datos de negocio.
 *
 * Gramaje → micras NO se convierte solo: Alejandra lo resuelve "al ojo" por
 * referencia (ej. "Poliéster 15 g" = ET de 12 micras), no con una fórmula.
 * Mientras no haya una regla suya, esa traducción solo sale de la tabla de
 * equivalencias; aquí se deja constancia del valor y se marca "a confirmar".
 */

const LB_KG = 0.45359237;
const IN_MM = 25.4;
const MIL_UM = 25.4;

export type UnidadPeso = 'kg' | 'lb' | 't';
export type UnidadLongitud = 'mm' | 'cm' | 'm' | 'in';
export type UnidadEspesor = 'um' | 'mil' | 'gm2';

export function unidadPeso(u: string): UnidadPeso | null {
  const n = norm(u);
  if (/^(kg|kgs|kilo|kilos|kilogramo|kilogramos)$/.test(n)) return 'kg';
  if (/^(lb|lbs|libra|libras|pound|pounds)$/.test(n)) return 'lb';
  if (/^(t|ton|tons|tonelada|toneladas)$/.test(n)) return 't';
  return null;
}

export function unidadLongitud(u: string): UnidadLongitud | null {
  const n = norm(u);
  if (/^(mm|milimetro|milimetros)$/.test(n)) return 'mm';
  if (/^(cm|centimetro|centimetros)$/.test(n)) return 'cm';
  if (/^(m|metro|metros)$/.test(n)) return 'm';
  if (/^(in|inch|inches|pulg|pulgada|pulgadas|"|'')$/.test(n)) return 'in';
  return null;
}

export function unidadEspesor(u: string): UnidadEspesor | null {
  const n = norm(u);
  if (/^(um|µm|μm|micra|micras|micron|micrones|mic|microns?)$/.test(n)) return 'um';
  if (/^(mil|mils)$/.test(n)) return 'mil';
  if (/^(g|gr|grs|gramos?|g\/m2|g\/m²|gm2|gsm)$/.test(n)) return 'gm2';
  return null;
}

export function aKilos(valor: number, unidad: UnidadPeso): { kilos: number; nota: string | null } {
  if (unidad === 'kg') return { kilos: round(valor, 3), nota: null };
  const kilos = round(unidad === 'lb' ? valor * LB_KG : valor * 1000, 3);
  return { kilos, nota: `${fmt(valor)} ${unidad} → ${fmt(kilos)} kg` };
}

export function aMilimetros(valor: number, unidad: UnidadLongitud): { mm: number; nota: string | null } {
  if (unidad === 'mm') return { mm: round(valor, 2), nota: null };
  const factor = unidad === 'cm' ? 10 : unidad === 'm' ? 1000 : IN_MM;
  const mm = round(valor * factor, 2);
  return { mm, nota: `${fmt(valor)} ${unidad} → ${fmt(mm)} mm` };
}

/** `null` en micras = no se convierte (gramaje): queda como nota "a confirmar". */
export function aMicras(valor: number, unidad: UnidadEspesor): { micras: number | null; nota: string | null } {
  if (unidad === 'um') return { micras: round(valor, 2), nota: null };
  if (unidad === 'mil') {
    const micras = round(valor * MIL_UM, 2);
    return { micras, nota: `${fmt(valor)} mil → ${fmt(micras)} µm` };
  }
  return {
    micras: null,
    nota: `Gramaje ${fmt(valor)} g/m²: no se convierte a micras con fórmula (se traduce por la tabla de equivalencias o lo confirma Customer Service).`,
  };
}

/**
 * "1.000,5" (Colombia) y "1,000.5" (EE. UU.) → 1000.5. Con un solo
 * separador seguido de exactamente 3 dígitos se lee como miles
 * ("1.000" = 1000, "2,500" = 2500); si no, como decimal ("12,5" = 12.5).
 */
export function parseNumero(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    const thousands = dec === '.' ? ',' : '.';
    normalized = s.split(thousands).join('').replace(dec, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    const miles = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
    normalized = miles ? parts.join('') : parts.length === 2 ? `${parts[0]}.${parts[1]}` : '';
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return normalized && Number.isFinite(n) ? n : null;
}

function norm(u: string): string {
  return u.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.$/, '');
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function fmt(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 3 });
}
