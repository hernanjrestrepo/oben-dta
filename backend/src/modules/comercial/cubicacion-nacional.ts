/**
 * Cubicación de proformas NACIONALES (Hernán, 6-nov-2026).
 *  - Si la línea es una ESPECIALIDAD, la cubica Planeación a mano, siempre.
 *  - Si no es especialidad y la línea pesa menos de 4.000 kg netos, también se cubica a mano.
 *  - Lo demás se cubica automáticamente.
 *
 * Especialidades = la lista "Suma de MOQ (TM)" (BU, Tipo, Film, Tratamiento, Micraje) que entregó Hernán. Cada
 * película se identifica por su código de Oben: BU + Film + Tratamiento (p. ej. BOPET ETi TN → ET---0012TN).
 */

export const LIMITE_CUBICACION_AUTOMATICA_KG = 4000;

export interface EspecialidadFilm {
  bu: 'BOPET' | 'BOPP' | 'PETS';
  tipo: 'Transparente' | 'Metal' | 'Cristal';
  film: string;
  tratamiento: string;
  micraje: number;
}

/** La lista de la captura, tal cual. */
export const ESPECIALIDADES: EspecialidadFilm[] = [
  { bu: 'BOPET', tipo: 'Transparente', film: 'ETi', tratamiento: 'TN', micraje: 12 },
  { bu: 'BOPET', tipo: 'Transparente', film: 'ETm', tratamiento: 'TH', micraje: 10 },
  { bu: 'BOPET', tipo: 'Transparente', film: 'ETm', tratamiento: 'TH', micraje: 12 },
  { bu: 'BOPET', tipo: 'Transparente', film: 'ETm', tratamiento: 'TN', micraje: 12 },
  { bu: 'BOPET', tipo: 'Metal', film: 'EMa', tratamiento: 'MQ', micraje: 12 },
  { bu: 'BOPET', tipo: 'Metal', film: 'EMa', tratamiento: 'MT', micraje: 10 },
  { bu: 'BOPET', tipo: 'Metal', film: 'EMq', tratamiento: 'MT', micraje: 10 },
  { bu: 'BOPET', tipo: 'Metal', film: 'ENq', tratamiento: 'MT', micraje: 10 },
  { bu: 'BOPP', tipo: 'Cristal', film: 'BC', tratamiento: 'TN', micraje: 17 },
  { bu: 'BOPP', tipo: 'Cristal', film: 'BC', tratamiento: 'TN', micraje: 20 },
  { bu: 'BOPP', tipo: 'Cristal', film: 'FC', tratamiento: 'TN', micraje: 50 },
  { bu: 'BOPP', tipo: 'Cristal', film: 'SC', tratamiento: 'TN', micraje: 38 },
  { bu: 'BOPP', tipo: 'Cristal', film: 'SC', tratamiento: 'TN', micraje: 50 },
  { bu: 'PETS', tipo: 'Transparente', film: 'TEG', tratamiento: 'NN', micraje: 40 },
  { bu: 'PETS', tipo: 'Transparente', film: 'TEG01', tratamiento: 'NN', micraje: 45 },
  { bu: 'PETS', tipo: 'Transparente', film: 'TEG02', tratamiento: 'NN', micraje: 45 },
  { bu: 'PETS', tipo: 'Transparente', film: 'TEG03', tratamiento: 'NN', micraje: 45 },
  { bu: 'PETS', tipo: 'Transparente', film: 'TES', tratamiento: 'NN', micraje: 50 },
  { bu: 'PETS', tipo: 'Transparente', film: 'TESc', tratamiento: 'NN', micraje: 40 },
  { bu: 'PETS', tipo: 'Transparente', film: 'TESc', tratamiento: 'NN', micraje: 45 },
  { bu: 'PETS', tipo: 'Transparente', film: 'TESx', tratamiento: 'NN', micraje: 40 },
  { bu: 'PETS', tipo: 'Transparente', film: 'TESx', tratamiento: 'NN', micraje: 45 },
];

/** Código de película de Oben de una fila de la lista: "ET" + "---" + micraje a 4 dígitos + tratamiento (ET---0012TN). */
export function codigoPeliculaEspecialidad(e: EspecialidadFilm): string {
  const letras = e.film.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);
  return `${letras}---${String(e.micraje).padStart(4, '0')}${e.tratamiento.toUpperCase()}`;
}

/** Película (código de Oben, p. ej. "ET---0012TN") ¿está en la lista de especialidades? */
export function esEspecialidad(codigoOben: string | null | undefined): boolean {
  if (!codigoOben) return false;
  const c = codigoOben.replace(/-/g, '').toUpperCase();
  return ESPECIALIDADES.some((e) => codigoPeliculaEspecialidad(e).replace(/-/g, '') === c);
}

/** ¿La línea se cubica a mano? (especialidad, o no especialidad con menos de 4.000 kg netos). */
export function cubicarAMano(linea: { codigoOben?: string | null; kilos?: number | null }): boolean {
  if (esEspecialidad(linea.codigoOben)) return true;
  return (linea.kilos ?? 0) < LIMITE_CUBICACION_AUTOMATICA_KG;
}

/** Líneas que Planeación debe cubicar a mano, en claro. Vacío si toda la proforma puede cubicarse sola. */
export function lineasParaCubicarAMano(lineas: Array<{ n: number; codigoOben?: string | null; kilos?: number | null }>): string[] {
  return lineas.filter((l) => cubicarAMano(l)).map((l) => {
    const motivo = esEspecialidad(l.codigoOben) ? 'especialidad' : `menos de ${LIMITE_CUBICACION_AUTOMATICA_KG.toLocaleString('es-CO')} kg`;
    return `Línea ${l.n} (${l.codigoOben ?? 'sin referencia'}): ${motivo}`;
  });
}
