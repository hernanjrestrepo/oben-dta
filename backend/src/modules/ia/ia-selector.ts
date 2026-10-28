/**
 * Modo inteligente de modelos (Hernán, 28-oct): escoger el modelo con mejor costo-beneficio según lo que se pida.
 * Funciones puras sobre el catálogo de OpenRouter, para probarlas sin red. El precio SIEMPRE sale del catálogo vivo
 * (nunca cableado); lo que se cablea es qué modelos son aceptables en cada nivel de calidad, porque "el más barato" a
 * secas escoge basura.
 */
export type NivelCalidad = 'economico' | 'estandar' | 'alta';
export const NIVELES: NivelCalidad[] = ['economico', 'estandar', 'alta'];

export interface ModeloVideoCatalogo {
  id: string;
  supported_durations?: number[] | null;
  supported_resolutions?: string[] | null;
  supported_aspect_ratios?: string[] | null;
  generate_audio?: boolean | null;
  pricing_skus?: Record<string, string> | null;
}

export interface ModeloImagenCatalogo {
  id: string;
  pricing?: Record<string, string> | null;
}

/** Aceptables por nivel (validados el 28-oct con el catálogo). Dentro de un nivel gana el más barato que cumpla lo pedido. */
export const VIDEO_POR_NIVEL: Record<NivelCalidad, string[]> = {
  economico: ['google/veo-3.1-lite', 'alibaba/wan-3.0'],
  estandar: ['google/veo-3.1-fast', 'kwaivgi/kling-v3.0-std', 'alibaba/wan-3.0-prime'],
  alta: ['google/veo-3.1', 'kwaivgi/kling-v3.0-pro'],
};
export const IMAGEN_POR_NIVEL: Record<NivelCalidad, string[]> = {
  economico: ['google/gemini-3.1-flash-lite-image', 'google/gemini-2.5-flash-image'],
  estandar: ['google/gemini-3.1-flash-image', 'openai/gpt-5-image-mini'],
  alta: ['google/gemini-3-pro-image', 'openai/gpt-5.4-image-2'],
};

export interface PedidoVideo {
  duracion?: number;
  resolucion?: string;
  formato?: string;
  audio?: boolean;
  nivel?: NivelCalidad;
}

export interface OpcionVideo {
  modelo: string;
  nivel: NivelCalidad;
  duracion: number;
  resolucion: string;
  formato: string;
  audio: boolean;
  usdPorSegundo: number;
  estimadoUsd: number;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Tarifa en USD por segundo de video. El catálogo trae llaves distintas por modelo: `duration_seconds*` ya vienen en
 * USD por segundo (comprobado: Veo 3.1 Lite 720p con audio = 0,05 → 8 s = US$0,40 cobrados), y `cents_per_*` en centavos.
 * Modelos que cobran por "video_tokens" no se usan (no se puede estimar con certeza).
 */
export function tarifaPorSegundo(sku: Record<string, string> | null | undefined, resolucion: string, audio: boolean): number | null {
  if (!sku) return null;
  const a = audio ? 'with_audio' : 'without_audio';
  const directas = [`duration_seconds_${a}_${resolucion}`, `duration_seconds_${a}`, `duration_seconds_${resolucion}`, 'duration_seconds', `text_to_video_duration_seconds_${resolucion}`];
  for (const k of directas) {
    const v = num(sku[k]);
    if (v !== null) return v;
  }
  for (const k of [`cents_per_video_output_second_${resolucion}`, `cents_per_second_output_${resolucion}`, 'cents_per_second_output']) {
    const v = num(sku[k]);
    if (v !== null) return v / 100;
  }
  return null;
}

/** Duración permitida más cercana por encima de la pedida (o la mayor si ninguna alcanza). */
export function duracionSoportada(pedida: number, soportadas: number[] | null | undefined): number | null {
  const l = [...(soportadas ?? [])].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (l.length === 0) return null;
  return l.find((n) => n >= pedida) ?? l[l.length - 1];
}

/** Opciones válidas del nivel pedido y de los superiores, de la más barata a la más cara dentro de cada nivel. */
export function opcionesVideo(catalogo: ModeloVideoCatalogo[], p: PedidoVideo = {}): OpcionVideo[] {
  const resolucion = p.resolucion ?? '720p';
  const formato = p.formato ?? '16:9';
  const audio = p.audio !== false;
  const pedida = p.duracion && p.duracion > 0 ? p.duracion : 6;
  const desde = NIVELES.indexOf(p.nivel ?? 'economico');
  const salida: OpcionVideo[] = [];
  for (const nivel of NIVELES.slice(desde)) {
    const delNivel: OpcionVideo[] = [];
    for (const id of VIDEO_POR_NIVEL[nivel]) {
      const m = catalogo.find((x) => x.id === id);
      if (!m) continue;
      if (m.supported_resolutions && !m.supported_resolutions.includes(resolucion)) continue;
      if (m.supported_aspect_ratios && !m.supported_aspect_ratios.includes(formato)) continue;
      if (audio && m.generate_audio !== true) continue; // sin garantía de audio no se ofrece como "con audio"
      const duracion = duracionSoportada(pedida, m.supported_durations);
      const tarifa = tarifaPorSegundo(m.pricing_skus, resolucion, audio);
      if (duracion === null || tarifa === null) continue;
      delNivel.push({ modelo: id, nivel, duracion, resolucion, formato, audio, usdPorSegundo: tarifa, estimadoUsd: Math.round(tarifa * duracion * 10000) / 10000 });
    }
    delNivel.sort((a, b) => a.estimadoUsd - b.estimadoUsd);
    salida.push(...delNivel);
  }
  return salida;
}

export function elegirVideo(catalogo: ModeloVideoCatalogo[], p: PedidoVideo = {}): OpcionVideo | null {
  return opcionesVideo(catalogo, p)[0] ?? null;
}

/** Tokens de salida que consume una imagen (≈1.300) para estimar el costo antes de pedirla; el costo real lo informa OpenRouter. */
const TOKENS_IMAGEN = 1300;

export interface OpcionImagen {
  modelo: string;
  nivel: NivelCalidad;
  estimadoUsd: number;
}

export function opcionesImagen(catalogo: ModeloImagenCatalogo[], nivel: NivelCalidad = 'economico'): OpcionImagen[] {
  const salida: OpcionImagen[] = [];
  for (const n of NIVELES.slice(NIVELES.indexOf(nivel))) {
    const delNivel: OpcionImagen[] = [];
    for (const id of IMAGEN_POR_NIVEL[n]) {
      const m = catalogo.find((x) => x.id === id);
      const porToken = num(m?.pricing?.image_output);
      if (!m || porToken === null) continue;
      delNivel.push({ modelo: id, nivel: n, estimadoUsd: Math.round((porToken * TOKENS_IMAGEN + (num(m.pricing?.prompt) ?? 0) * 200) * 10000) / 10000 });
    }
    delNivel.sort((a, b) => a.estimadoUsd - b.estimadoUsd);
    salida.push(...delNivel);
  }
  return salida;
}

export function elegirImagen(catalogo: ModeloImagenCatalogo[], nivel: NivelCalidad = 'economico'): OpcionImagen | null {
  return opcionesImagen(catalogo, nivel)[0] ?? null;
}

export interface Topes {
  porPedidoUsd: number;
  porDiaUsd: number;
  porMesUsd: number;
}
export const TOPES_POR_DEFECTO: Topes = { porPedidoUsd: 1, porDiaUsd: 5, porMesUsd: 50 };

/** Topes del tenant (`settings.ia`); lo que falte o sea inválido usa el valor por defecto. */
export function topesDe(ajustes: unknown): Topes {
  const a = (ajustes ?? {}) as Record<string, unknown>;
  const v = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : d);
  return { porPedidoUsd: v(a.topePedidoUsd, TOPES_POR_DEFECTO.porPedidoUsd), porDiaUsd: v(a.topeDiaUsd, TOPES_POR_DEFECTO.porDiaUsd), porMesUsd: v(a.topeMesUsd, TOPES_POR_DEFECTO.porMesUsd) };
}

export interface ResultadoTope {
  ok: boolean;
  motivo?: string;
}

/** ¿Cabe este costo estimado en los tres topes? `gastadoHoy` y `gastadoMes` ya incluyen lo que está en proceso. */
export function verificarTopes(estimadoUsd: number, gastadoHoyUsd: number, gastadoMesUsd: number, t: Topes): ResultadoTope {
  const usd = (n: number) => `US$${n.toFixed(2)}`;
  if (estimadoUsd > t.porPedidoUsd) return { ok: false, motivo: `Cuesta unos ${usd(estimadoUsd)} y el tope por pedido es ${usd(t.porPedidoUsd)}.` };
  if (gastadoHoyUsd + estimadoUsd > t.porDiaUsd) return { ok: false, motivo: `Hoy ya van ${usd(gastadoHoyUsd)} y con este pedido pasaría el tope diario de ${usd(t.porDiaUsd)}.` };
  if (gastadoMesUsd + estimadoUsd > t.porMesUsd) return { ok: false, motivo: `Este mes ya van ${usd(gastadoMesUsd)} y con este pedido pasaría el tope mensual de ${usd(t.porMesUsd)}.` };
  return { ok: true };
}
