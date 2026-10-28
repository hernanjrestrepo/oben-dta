import catalogoVideo from './fixtures/catalogo-video.json';
import catalogoImagen from './fixtures/catalogo-imagen.json';
import { duracionSoportada, elegirImagen, elegirVideo, opcionesVideo, tarifaPorSegundo, topesDe, verificarTopes, TOPES_POR_DEFECTO, type ModeloVideoCatalogo } from './ia-selector';

// Fixtures = catálogo REAL de OpenRouter del 28-oct (precios incluidos).
const VIDEO = catalogoVideo as unknown as ModeloVideoCatalogo[];

describe('modo inteligente: selector de modelos (28-oct)', () => {
  it('video económico 720p con audio: Veo 3.1 Lite, y 8 s cuestan US$0,40 (lo que se cobró en la prueba real)', () => {
    const o = elegirVideo(VIDEO, { duracion: 8 })!;
    expect(o).toMatchObject({ modelo: 'google/veo-3.1-lite', nivel: 'economico', duracion: 8, resolucion: '720p', formato: '16:9', audio: true });
    expect(o.estimadoUsd).toBeCloseTo(0.4, 4);
  });

  it('duración por defecto 6 s; una duración no soportada sube a la siguiente permitida', () => {
    expect(elegirVideo(VIDEO, {})!.duracion).toBe(6);
    expect(elegirVideo(VIDEO, { duracion: 5 })!.duracion).toBe(6);
    expect(elegirVideo(VIDEO, { duracion: 30 })!.duracion).toBe(8); // la mayor que soporta
    expect(duracionSoportada(7, [8, 4, 6])).toBe(8);
    expect(duracionSoportada(3, [])).toBeNull();
  });

  it('el nivel sube el modelo: estándar → Veo 3.1 Fast, alta → Veo 3.1', () => {
    expect(elegirVideo(VIDEO, { nivel: 'estandar', duracion: 8 })!.modelo).not.toBe('google/veo-3.1-lite');
    const alta = elegirVideo(VIDEO, { nivel: 'alta', duracion: 8 })!;
    expect(['google/veo-3.1', 'kwaivgi/kling-v3.0-pro']).toContain(alta.modelo); // gana el más barato del nivel
    expect(alta.nivel).toBe('alta');
    expect(alta.estimadoUsd).toBeGreaterThan(elegirVideo(VIDEO, { duracion: 8 })!.estimadoUsd);
  });

  it('dentro de un nivel gana el más barato que cumpla; sin audio garantizado no se ofrece como "con audio"', () => {
    const catalogo: ModeloVideoCatalogo[] = [
      { id: 'google/veo-3.1-lite', supported_durations: [4, 6, 8], supported_resolutions: ['720p'], supported_aspect_ratios: ['16:9'], generate_audio: true, pricing_skus: { duration_seconds_with_audio_720p: '0.50' } },
      { id: 'alibaba/wan-3.0', supported_durations: [4, 6, 8], supported_resolutions: ['720p'], supported_aspect_ratios: ['16:9'], generate_audio: true, pricing_skus: { duration_seconds_720p: '0.10' } },
    ];
    expect(elegirVideo(catalogo, {})!.modelo).toBe('alibaba/wan-3.0');
    catalogo[1].generate_audio = null;
    expect(elegirVideo(catalogo, {})!.modelo).toBe('google/veo-3.1-lite');
  });

  it('pedidos imposibles no devuelven nada (formato o resolución no soportados, modelo sin precio)', () => {
    expect(elegirVideo(VIDEO, { formato: '21:9' })).toBeNull();
    expect(elegirVideo(VIDEO, { resolucion: '8K' })).toBeNull();
    expect(elegirVideo([{ id: 'google/veo-3.1-lite', supported_durations: [8], supported_resolutions: ['720p'], generate_audio: true, pricing_skus: { video_tokens: '0.000001' } }], {})).toBeNull();
    expect(elegirVideo([], {})).toBeNull();
  });

  it('opcionesVideo devuelve primero el nivel pedido y después los superiores, para ofrecer alternativas', () => {
    const o = opcionesVideo(VIDEO, { duracion: 6 });
    expect(o[0].nivel).toBe('economico');
    expect(o.map((x) => x.nivel)).toEqual([...o.map((x) => x.nivel)].sort((a, b) => ['economico', 'estandar', 'alta'].indexOf(a) - ['economico', 'estandar', 'alta'].indexOf(b)));
  });

  it('tarifaPorSegundo lee las llaves del catálogo: por segundo en USD y cents_* en centavos', () => {
    expect(tarifaPorSegundo({ duration_seconds_with_audio_720p: '0.05' }, '720p', true)).toBe(0.05);
    expect(tarifaPorSegundo({ cents_per_video_output_second_720p: '3' }, '720p', false)).toBeCloseTo(0.03, 5);
    expect(tarifaPorSegundo({ video_tokens: '0.1' }, '720p', true)).toBeNull();
    expect(tarifaPorSegundo(null, '720p', true)).toBeNull();
  });

  it('imagen: económico = la más barata del nivel; el estimado queda cerca del costo real medido (US$0,034)', () => {
    const o = elegirImagen(catalogoImagen, 'economico')!;
    expect(o.modelo).toBe('google/gemini-3.1-flash-lite-image');
    expect(o.estimadoUsd).toBeGreaterThan(0.02);
    expect(o.estimadoUsd).toBeLessThan(0.06);
    expect(elegirImagen(catalogoImagen, 'alta')!.estimadoUsd).toBeGreaterThan(o.estimadoUsd);
    expect(elegirImagen([], 'economico')).toBeNull();
  });

  it('topes: por pedido, por día y por mes; los valores inválidos usan los de por defecto', () => {
    expect(topesDe(undefined)).toEqual(TOPES_POR_DEFECTO);
    expect(topesDe({ topePedidoUsd: 2, topeDiaUsd: -1, topeMesUsd: 'x' })).toEqual({ porPedidoUsd: 2, porDiaUsd: 5, porMesUsd: 50 });
    const t = { porPedidoUsd: 1, porDiaUsd: 5, porMesUsd: 50 };
    expect(verificarTopes(0.4, 0, 0, t).ok).toBe(true);
    expect(verificarTopes(3, 0, 0, t)).toMatchObject({ ok: false, motivo: expect.stringContaining('tope por pedido') });
    expect(verificarTopes(0.9, 4.5, 4.5, t)).toMatchObject({ ok: false, motivo: expect.stringContaining('tope diario') });
    expect(verificarTopes(0.9, 1, 49.5, t)).toMatchObject({ ok: false, motivo: expect.stringContaining('tope mensual') });
    expect(verificarTopes(1, 4, 10, t).ok).toBe(true); // justo en el tope: pasa
  });
});
