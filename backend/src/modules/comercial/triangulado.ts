/**
 * Pedidos de Estados Unidos triangulados con OBEN US (Alejandra Molinares, 6-nov-2026; OC 3019081 de American Packaging):
 *  - la orden de compra del cliente final va dirigida a OBEN US (proveedor "OBEN US, LLC"): NUESTRO cliente es OBEN US,
 *    nunca el dueño del dominio del correo ni el cliente final;
 *  - el destino es la dirección de entrega de la orden (Deliver To), que en OBEN MAS es uno de los destinos de OBEN US;
 *  - el precio de la orden es el de OBEN US con su cliente: el nuestro es el "Transfer Price" del cuerpo del correo.
 */

/** CodSec_Entity de OBEN US, LLC en OBEN MAS. */
export const OBEN_US_CODIGO = '9995';

const LB_KG = 0.45359237;

/** ¿La orden va dirigida a OBEN US? ("APC (OBEN US)" en el asunto o "OBEN US, LLC" como proveedor en la orden). */
export function esPedidoObenUs(texto: string): boolean {
  return /\(\s*OBEN\s+US\s*\)|\bOBEN\s+US\s*,?\s*LLC\b/i.test(texto ?? '');
}

export interface PrecioTransferencia {
  /** Oben Grade de la fila (p. ej. "ET11TN"). */
  grado: string;
  porKg: number;
  nota: string;
}

const numero = (s: string): number => Number(s.replace(/\./g, '').replace(',', '.'));
const numeroFlexible = (s: string): number => (/,\d+$/.test(s) ? numero(s) : Number(s.replace(/,/g, '')));
const redondear = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * El "Transfer Price" del cuadro del correo ("Oben Grade | Cust Price | Transfer Price | Cust Price | Transfer Price",
 * en US$/lb y US$/kg). Con cuatro valores se toma el Transfer Price en US$/kg; con dos (solo US$/lb) se convierte a kg.
 */
export function preciosTransferencia(texto: string): PrecioTransferencia[] {
  if (!/transfer\s*price/i.test(texto ?? '')) return [];
  const soloKg = /US\$\s*\/\s*kg/i.test(texto) && !/US\$\s*\/\s*lb/i.test(texto);
  const NUM = '(\\d+(?:[.,]\\d+)?)';
  const SEP = '\\s*[|\\t ]\\s*';
  const fila = new RegExp(`^\\s*([A-Z]{2,4}[A-Z0-9-]*\\d[A-Z0-9-]*)${SEP}${NUM}${SEP}${NUM}(?:${SEP}${NUM}${SEP}${NUM})?\\s*\\|?\\s*$`, 'gim');
  const out: PrecioTransferencia[] = [];
  for (const m of texto.matchAll(fila)) {
    const grado = m[1].toUpperCase();
    if (m[4] && m[5]) {
      const kg = numeroFlexible(m[5]);
      if (kg > 0) out.push({ grado, porKg: kg, nota: `precio de transferencia a OBEN US (cuerpo del correo): ${m[5]} US$/kg` });
    } else {
      const v = numeroFlexible(m[3]);
      if (!(v > 0)) continue;
      const kg = soloKg ? v : redondear(v / LB_KG);
      out.push({ grado, porKg: kg, nota: soloKg ? `precio de transferencia a OBEN US (cuerpo del correo): ${m[3]} US$/kg` : `precio de transferencia a OBEN US (cuerpo del correo): ${m[3]} US$/lb → ${kg} US$/kg` });
    }
  }
  return out;
}

/**
 * CDD del cuerpo del correo = fecha requerida por el cliente (Hernán, 6-nov). Customer Service de Oben (Perú) la escribe
 * día/mes/año: "CDD: 08/01/27" es el 8 de enero de 2027 (la orden dice 1/8/2027 en formato de EE. UU.).
 */
export function fechaCdd(texto: string): string | null {
  const m = (texto ?? '').match(/\bCDD\s*:?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/i);
  if (!m) return null;
  const [dia, mes] = [Number(m[1]), Number(m[2])];
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** "ET11TN" y "ET-TN-11" son la misma película: mismas letras y mismos números, en cualquier orden. */
function firma(t: string): string {
  const u = t.toUpperCase();
  return `${(u.match(/[A-Z]/g) ?? []).sort().join('')}|${(u.match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b).join('.')}`;
}

/** El precio de transferencia que corresponde a una línea: el de su película, o el único que trae el correo. */
export function precioParaLinea(precios: PrecioTransferencia[], textoLinea: string): PrecioTransferencia | null {
  if (precios.length === 0) return null;
  const tokens = (textoLinea.toUpperCase().match(/[A-Z]{2,4}[A-Z0-9-]*\d[A-Z0-9-]*/g) ?? []).map(firma);
  const propio = precios.find((p) => tokens.includes(firma(p.grado)));
  if (propio) return propio;
  return precios.length === 1 ? precios[0] : null;
}
