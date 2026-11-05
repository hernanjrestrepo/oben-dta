/**
 * Límites de una proforma (documento "OBEN XMART ESPECIFICACIONES", 5-nov-2026; aclarado por Alejandra Molinares):
 *  - el peso NETO máximo por proforma es el peso bruto máximo del contenedor del país de destino menos 2.000 kg;
 *  - por tipo de película (línea: BOPP, BOPET...) solo caben 4 SKU, y un SKU es el producto completo con su micraje
 *    (SC---0030TN, SC---0035TN y SC---0020TN son 3 SKU distintos).
 */

/** Peso bruto máximo por contenedor (kg) según el país de destino. Estados Unidos no está: lo parametriza cada cliente en OBEN MAS. */
export const PESO_BRUTO_MAX_POR_PAIS: Record<string, number> = {
  ALEMANIA: 23500,
  ARGENTINA: 26000,
  BRASIL: 26000,
  CHILE: 26000,
  COLOMBIA: 30000,
  'COSTA RICA': 21000,
  ECUADOR: 26000,
  'EL SALVADOR': 21500,
  ESPANA: 24000,
  FRANCIA: 24500,
  GUATEMALA: 24000,
  HONDURAS: 21000,
  ITALIA: 25000,
  LIBANO: 25000,
  MEXICO: 22000,
  PERU: 27000,
  POLONIA: 22000,
  PORTUGAL: 24000,
  'REPUBLICA DOMINICANA': 24000,
  VENEZUELA: 26000,
};

export const MARGEN_PESO_KG = 2000;
export const MAX_SKU_POR_LINEA = 4;

const normalizar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

export interface TopePeso {
  /** Peso neto máximo que se puede ingresar en la proforma. */
  netoMaxKg: number;
  /** Peso bruto máximo del contenedor del que sale. */
  brutoMaxKg: number;
  origen: 'tabla' | 'oben';
}

/** Tope de peso neto de una proforma: tabla por país o, si el país no está, el Peso_Bruto_Maximo que Oben tiene del cliente. */
export function topePesoNeto(pais: string, brutoMaxParametrizado?: number | null): TopePeso | null {
  const deTabla = PESO_BRUTO_MAX_POR_PAIS[normalizar(pais)];
  const bruto = deTabla ?? (brutoMaxParametrizado && brutoMaxParametrizado > 0 ? brutoMaxParametrizado : null);
  if (!bruto) return null;
  return { netoMaxKg: bruto - MARGEN_PESO_KG, brutoMaxKg: bruto, origen: deTabla ? 'tabla' : 'oben' };
}

const kg = (n: number): string => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });

/**
 * Revisión de los dos límites. `bloqueos`: la proforma no se puede crear así (hay que dividir el pedido);
 * `avisos`: no se pudo verificar (país sin tope en la tabla ni en OBEN MAS).
 */
export function revisarLimitesProforma(entrada: {
  pais: string;
  brutoMaxParametrizado?: number | null;
  kilosNetos: number;
  lineas: Array<{ linea: string | null; referencia: string }>;
}): { avisos: string[]; bloqueos: string[] } {
  const avisos: string[] = [];
  const bloqueos: string[] = [];
  const tope = topePesoNeto(entrada.pais, entrada.brutoMaxParametrizado);
  if (!tope) {
    avisos.push(`No hay peso bruto máximo por contenedor para ${entrada.pais || 'este destino'} (ni en la tabla ni en OBEN MAS): no se pudo verificar el peso máximo de la proforma.`);
  } else if (entrada.kilosNetos > tope.netoMaxKg) {
    bloqueos.push(
      `Los kilos netos (${kg(entrada.kilosNetos)} kg) superan el máximo por proforma para ${entrada.pais}: ${kg(tope.netoMaxKg)} kg ` +
        `(peso bruto máximo del contenedor ${kg(tope.brutoMaxKg)} kg menos ${kg(MARGEN_PESO_KG)} kg). Hay que dividir el pedido.`,
    );
  }
  const porLinea = new Map<string, Set<string>>();
  for (const l of entrada.lineas) {
    const clave = l.linea?.trim() || '(sin línea)';
    (porLinea.get(clave) ?? porLinea.set(clave, new Set()).get(clave)!).add(l.referencia);
  }
  for (const [linea, skus] of porLinea) {
    if (skus.size > MAX_SKU_POR_LINEA) {
      bloqueos.push(`La línea ${linea} trae ${skus.size} SKU (${[...skus].join(', ')}); el máximo por proforma es ${MAX_SKU_POR_LINEA}. Hay que dividir el pedido.`);
    }
  }
  return { avisos, bloqueos };
}
