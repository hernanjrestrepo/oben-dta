/**
 * Partidas arancelarias que Oben entregó el 2026-10-02 (texto tal como las
 * imprime la factura de exportación: español // inglés).
 *
 * Una partida puede servir a más de una película (BOPP y BOPP metalizado
 * comparten 3920.20.19 pero se describen distinto), así que la tabla es por
 * TIPO de película y no por código.
 */
export type TipoPelicula = 'bopp' | 'bopp_metalizado' | 'pet' | 'pet_termoencogible';

export interface PartidaArancelaria {
  tipo: TipoPelicula;
  ncm: string;
  /** null = Oben aún no dio la NALADI de este tipo (no se inventa). */
  naladi: string | null;
  descripcionEs: string;
  descripcionEn: string;
}

/**
 * Respuesta de Jorge (2026-10-05): estos 4 son TODOS los tipos de película que
 * Colombia hace, y una PF puede mezclarlos (el encabezado de la liquidación
 * lleva una sola partida). Las descripciones oficiales de la factura son las
 * de la tabla de abajo; lo único que cambia por país son las observaciones.
 */
export const PARTIDAS: Record<TipoPelicula, PartidaArancelaria> = {
  bopp: {
    tipo: 'bopp',
    ncm: '3920.20.19',
    // Verificada en la FEXP3190 real (PA NCM 3920.20.19 / PA NALADI 3920.20.10).
    naladi: '3920.20.10',
    descripcionEs: 'PELICULA DE POLIPROPILENO BIORIENTADO',
    descripcionEn: 'BIORIENTED POLYPROPYLENE FILM',
  },
  bopp_metalizado: {
    tipo: 'bopp_metalizado',
    ncm: '3920.20.19',
    naladi: null,
    descripcionEs: 'PELICULA DE POLIPROPILENO BIORIENTADO METALIZADO',
    descripcionEn: 'METALLIZED BIAXIALLY BIORIENTED POLYPROPYLENE FILM',
  },
  pet: {
    tipo: 'pet',
    ncm: '3920.62.19',
    naladi: null,
    descripcionEs: 'PELICULA DE POLIETILENO TEREFTALATO',
    descripcionEn: 'POLYETHYLENE-TEREPHTHALATE BIORIENTED FILM',
  },
  pet_termoencogible: {
    tipo: 'pet_termoencogible',
    ncm: '3920.62.00.20',
    naladi: null,
    descripcionEs: 'PELICULA DE COPOLIESTER TERMOCONTRAIBLE',
    descripcionEn: 'POLYESTER FILM, HEAT-SHRINKABLE',
  },
};

/**
 * Familia de película (primeros caracteres del código de material de Oben,
 * p. ej. "SC---0030TN0405S0760" → "SC") → tipo. Solo lo confirmado: "SC" es
 * OPP Seal Film (así sale en la FEXP3190 real). El resto de familias (p. ej.
 * "ENA") se agrega cuando Oben diga a qué tipo pertenece — hasta entonces
 * quedan sin partida y la liquidación usa la provisional.
 */
export const FAMILIA_A_TIPO: Record<string, TipoPelicula> = {
  SC: 'bopp',
};

/**
 * Arancel de importación en destino (Jorge, 2026-10-05): en destino NO se paga
 * arancel, salvo en EE. UU., donde es 12,5 %. Solo es informativo: la
 * liquidación no lo suma. Sigue sin confirmarse sobre qué base se calcula, si
 * aplica a todas las películas y si solo cuenta con DDP.
 */
export const ARANCEL_USA_PCT = 12.5;
export function arancelDestinoPct(esUSA: boolean): number {
  return esUSA ? ARANCEL_USA_PCT : 0;
}

/** Familia de un código de material ("SC---0030TN0405S0760" → "SC"); null si no tiene el formato de Oben. */
export function familiaDe(codigo: string): string | null {
  const m = codigo.trim().toUpperCase().match(/^([A-Z]{2,4}?)-{0,3}\d{2,4}[A-Z]{2}/);
  return m ? m[1] : null;
}

export function partidaDe(codigo: string): PartidaArancelaria | null {
  const familia = familiaDe(codigo);
  const tipo = familia ? FAMILIA_A_TIPO[familia] : undefined;
  return tipo ? PARTIDAS[tipo] : null;
}

/** Partida común de varios materiales: solo si todos resuelven a la MISMA (el encabezado lleva una sola). */
export function partidaComun(codigos: string[]): { partida: PartidaArancelaria | null; sinPartida: string[]; mezcla: boolean } {
  const resueltas = codigos.map((c) => ({ c, p: partidaDe(c) }));
  const sinPartida = resueltas.filter((x) => !x.p).map((x) => x.c);
  const distintas = new Set(resueltas.filter((x) => x.p).map((x) => `${x.p!.ncm}|${x.p!.naladi}`));
  if (sinPartida.length || distintas.size !== 1) return { partida: null, sinPartida, mezcla: distintas.size > 1 };
  return { partida: resueltas[0].p, sinPartida: [], mezcla: false };
}
