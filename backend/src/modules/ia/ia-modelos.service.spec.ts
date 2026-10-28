import { BadRequestException, ConflictException } from '@nestjs/common';
import catalogoVideo from './fixtures/catalogo-video.json';
import catalogoImagen from './fixtures/catalogo-imagen.json';
import { IaModelosService, inicioDiaBogota, inicioMesBogota } from './ia-modelos.service';

type Fila = Record<string, unknown> & { id: string };
const AHORA = new Date('2026-10-28T15:00:00Z'); // 10:00 a. m. en Bogotá

function armar(o: { ajustes?: Record<string, unknown>; gastoHoy?: number; gastoMes?: number; enProceso?: number; respuestas?: Record<string, () => unknown> } = {}) {
  process.env.OPENROUTER_API_KEY = 'sk-test';
  const filas: Fila[] = [];
  const usos = {
    filas,
    create: jest.fn((x: Record<string, unknown>) => ({ ...x })),
    save: jest.fn(async (x: Record<string, unknown>) => {
      const f = { id: `u${filas.length + 1}`, createdAt: AHORA, ...x } as Fila;
      filas.push(f);
      return f;
    }),
    update: jest.fn(async (w: { id: string }, c: Record<string, unknown>) => void Object.assign(filas.find((f) => f.id === w.id) ?? {}, c)),
    count: jest.fn(async () => o.enProceso ?? filas.filter((f) => f.estado === 'en_proceso').length),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => filas.find((f) => (where.id ? f.id === where.id : true)) ?? null),
    createQueryBuilder: jest.fn(() => {
      let desde: Date | null = null;
      const q = { select: () => q, where: (_s: string, p: { d: Date }) => ((desde = p.d), q), getRawOne: async () => ({ total: String(desde && desde.getUTCDate() === 1 ? (o.gastoMes ?? 0) : (o.gastoHoy ?? 0)) }) };
      return q;
    }),
  };
  const tenants = { findOne: jest.fn(async () => ({ id: 't1', settings: { ia: o.ajustes ?? {} } })) };
  const peticiones: Array<{ url: string; init?: RequestInit }> = [];
  const respuestas = o.respuestas ?? {};
  const http = jest.fn(async (url: string, init?: RequestInit) => {
    peticiones.push({ url: String(url), init });
    const u = String(url);
    // Coincide la llave MÁS larga (más específica): '/videos/gen-vid-3' gana a '/videos'.
    const clave = Object.keys(respuestas).filter((k) => u.includes(k)).sort((x, y) => y.length - x.length)[0];
    if (clave) return respuestas[clave]() as Response;
    if (u.endsWith('/videos/models')) return json(200, catalogoVideo);
    if (u.includes('/models?output_modalities=image')) return json(200, { data: catalogoImagen });
    throw new Error(`petición no prevista: ${u}`);
  });
  const svc = new IaModelosService(usos as never, tenants as never, { tenantId: 't1', userId: 'u1' } as never);
  svc.http = http as never;
  svc.reloj = () => AHORA;
  return { svc, usos, http, peticiones };
}

function json(status: number, body: unknown) {
  const texto = JSON.stringify(body);
  return { ok: status < 400, status, text: async () => texto, arrayBuffer: async () => Buffer.from(texto) } as unknown as Response;
}

describe('IaModelosService: modo inteligente con topes de costo (28-oct)', () => {
  // El endpoint real devuelve { data: [...] }.
  const conCatalogo = (extra: Record<string, () => unknown> = {}) => ({ '/videos/models': () => json(200, { data: catalogoVideo }), ...extra });

  it('fechas de Bogotá: el día y el mes empiezan a las 05:00 UTC', () => {
    expect(inicioDiaBogota(new Date('2026-10-28T03:00:00Z')).toISOString()).toBe('2026-10-27T05:00:00.000Z'); // todavía es 27 en Bogotá
    expect(inicioDiaBogota(AHORA).toISOString()).toBe('2026-10-28T05:00:00.000Z');
    expect(inicioMesBogota(AHORA).toISOString()).toBe('2026-10-01T05:00:00.000Z');
  });

  it('video: elige Veo 3.1 Lite, pide el trabajo con los parámetros correctos y deja el registro "en proceso" con el costo estimado', async () => {
    const { svc, usos, peticiones } = armar({ respuestas: conCatalogo({ '/videos': () => json(202, { id: 'gen-vid-1', status: 'pending' }) }) });
    const v = await svc.generarVideo('A BOPP film line, slow tracking shot', { duracion: 8 });
    expect(v).toMatchObject({ modelo: 'google/veo-3.1-lite', duracion: 8, resolucion: '720p', audio: true });
    expect(v.estimadoUsd).toBeCloseTo(0.4, 3);
    const envio = peticiones.find((p) => p.url.endsWith('/videos') && p.init?.method === 'POST')!;
    expect(JSON.parse(String(envio.init!.body))).toEqual({ model: 'google/veo-3.1-lite', prompt: 'A BOPP film line, slow tracking shot', duration: 8, resolution: '720p', aspect_ratio: '16:9', generate_audio: true });
    expect((envio.init!.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(usos.filas[0]).toMatchObject({ tipo: 'video', estado: 'en_proceso', trabajoId: 'gen-vid-1', usuarioId: 'u1', costoEstimadoUsd: v.estimadoUsd });
  });

  it('TOPE por pedido: un video caro no se pide, no se gasta nada y se explica por qué', async () => {
    const { svc, usos, peticiones } = armar({ respuestas: conCatalogo() });
    await expect(svc.generarVideo('Una escena larga de alta calidad', { duracion: 8, nivel: 'alta' })).rejects.toThrow(/tope por pedido/);
    expect(usos.filas).toHaveLength(0);
    expect(peticiones.some((p) => p.url.endsWith('/videos') && p.init?.method === 'POST')).toBe(false);
  });

  it('TOPE diario y mensual: con lo ya gastado no cabe otro video', async () => {
    let r = armar({ gastoHoy: 4.8, respuestas: conCatalogo() });
    await expect(r.svc.generarVideo('Una escena de prueba', { duracion: 8 })).rejects.toThrow(/tope diario/);
    r = armar({ gastoMes: 49.8, respuestas: conCatalogo() });
    await expect(r.svc.generarVideo('Una escena de prueba', { duracion: 8 })).rejects.toThrow(/tope mensual/);
    expect(r.usos.filas).toHaveLength(0);
  });

  it('los topes del tenant se pueden subir (settings.ia)', async () => {
    const { svc } = armar({ ajustes: { topePedidoUsd: 10 }, respuestas: conCatalogo({ '/videos': () => json(202, { id: 'gen-vid-2' }) }) });
    const v = await svc.generarVideo('Una escena de máxima calidad', { duracion: 8, nivel: 'alta' });
    expect(v.nivel).toBe('alta');
    expect(v.estimadoUsd).toBeGreaterThan(1);
  });

  it('máximo 3 videos en proceso a la vez', async () => {
    const { svc } = armar({ enProceso: 3, respuestas: conCatalogo() });
    await expect(svc.generarVideo('Otra escena de prueba', {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('si OpenRouter rechaza el pedido el registro queda "fallido" con costo 0 (no cuenta en el gasto)', async () => {
    const { svc, usos } = armar({ respuestas: conCatalogo({ '/videos': () => json(400, { error: { message: 'contenido no permitido' } }) }) });
    await expect(svc.generarVideo('Una escena cualquiera', {})).rejects.toThrow(/contenido no permitido/);
    expect(usos.filas[0]).toMatchObject({ estado: 'fallido', costoRealUsd: 0, error: 'contenido no permitido' });
  });

  it('descripción vacía o clave ausente: error claro, sin gastar', async () => {
    const { svc } = armar({ respuestas: conCatalogo() });
    await expect(svc.generarVideo('hola', {})).rejects.toThrow(/Describe lo que quieres/);
    delete process.env.OPENROUTER_API_KEY;
    await expect(svc.generarVideo('Una escena de prueba', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('estado del video: en proceso → no descarga; completado → entrega el archivo, cierra con el costo REAL y no cobra dos veces', async () => {
    let estado = 'in_progress';
    const { svc, usos, peticiones } = armar({
      respuestas: conCatalogo({
        '/videos': () => json(202, { id: 'gen-vid-3' }),
        '/videos/gen-vid-3/content': () => json(200, { mp4: true }),
        '/videos/gen-vid-3': () => json(200, { status: estado, usage: { cost: 0.4 } }),
      }),
    });
    const v = await svc.generarVideo('Una escena de prueba', { duracion: 8 });
    expect((await svc.estadoVideo(v.usoId)).estado).toBe('en_proceso');
    estado = 'completed';
    const listo = await svc.estadoVideo(v.usoId);
    expect(listo).toMatchObject({ estado: 'completado', costoUsd: 0.4 });
    expect(listo.buffer!.length).toBeGreaterThan(0);
    expect(usos.filas[0]).toMatchObject({ estado: 'completado', costoRealUsd: 0.4 });
    const otra = await svc.estadoVideo(v.usoId); // volver a pedir el archivo no cambia el registro
    expect(otra.estado).toBe('completado');
    expect(peticiones.filter((p) => p.url.endsWith('/videos') && p.init?.method === 'POST')).toHaveLength(1);
  });

  it('video fallido en el proveedor: se informa y no se cobra', async () => {
    const { svc, usos } = armar({ respuestas: conCatalogo({ '/videos': () => json(202, { id: 'gen-vid-4' }), '/videos/gen-vid-4': () => json(200, { status: 'failed', error: 'moderación' }) }) });
    const v = await svc.generarVideo('Una escena de prueba', {});
    expect(await svc.estadoVideo(v.usoId)).toMatchObject({ estado: 'fallido', costoUsd: 0 });
    expect(usos.filas[0]).toMatchObject({ estado: 'fallido', costoRealUsd: 0 });
  });

  it('imagen: elige el modelo económico, devuelve el archivo y registra el costo real que informa OpenRouter', async () => {
    const png = Buffer.from('imagen-falsa').toString('base64');
    const { svc, usos, peticiones } = armar({
      respuestas: {
        '/models?output_modalities=image': () => json(200, { data: catalogoImagen }),
        '/chat/completions': () => json(200, { choices: [{ message: { images: [{ image_url: { url: `data:image/jpeg;base64,${png}` } }] } }], usage: { cost: 0.0336 } }),
      },
    });
    const img = await svc.generarImagen('Flat vector illustration of a plastic film roll', 'economico');
    expect(img).toMatchObject({ modelo: 'google/gemini-3.1-flash-lite-image', mime: 'image/jpeg', costoUsd: 0.0336 });
    expect(img.buffer.toString()).toBe('imagen-falsa');
    expect(usos.filas[0]).toMatchObject({ tipo: 'imagen', estado: 'completado', costoRealUsd: 0.0336 });
    const cuerpo = JSON.parse(String(peticiones.find((p) => p.url.endsWith('/chat/completions'))!.init!.body));
    expect(cuerpo).toMatchObject({ model: 'google/gemini-3.1-flash-lite-image', modalities: ['image', 'text'] });
  });

  it('imagen sin imagen en la respuesta: falla, queda registrada como fallida y no cuenta en el gasto', async () => {
    const { svc, usos } = armar({
      respuestas: { '/models?output_modalities=image': () => json(200, { data: catalogoImagen }), '/chat/completions': () => json(200, { choices: [{ message: { content: 'no puedo' } }] }) },
    });
    await expect(svc.generarImagen('Una ilustración cualquiera', 'economico')).rejects.toThrow(/No se pudo generar la imagen/);
    expect(usos.filas[0]).toMatchObject({ estado: 'fallido', costoRealUsd: 0 });
  });

  it('gasto(): suma lo de hoy y del mes y trae los topes', async () => {
    const { svc } = armar({ gastoHoy: 0.9, gastoMes: 3.2, ajustes: { topeDiaUsd: 8 } });
    expect(await svc.gasto()).toMatchObject({ hoyUsd: 0.9, mesUsd: 3.2, topes: { porPedidoUsd: 1, porDiaUsd: 8, porMesUsd: 50 } });
  });

  it('cotizarVideo ofrece la opción más barata de cada nivel para el mismo pedido', async () => {
    const { svc } = armar({ respuestas: conCatalogo() });
    const c = await svc.cotizarVideo({ duracion: 6 });
    expect(c.map((x) => x.nivel)).toEqual(['economico', 'estandar', 'alta']);
    expect(c[0].estimadoUsd).toBeLessThan(c[2].estimadoUsd);
  });
});
