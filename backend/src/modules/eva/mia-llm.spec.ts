import { LlmCompatibleOpenAi, MiaLlmConRespaldo, MiaLlmError, crearMiaLlm, esSinSaldo, proveedoresMia, type MiaLlm } from './mia-llm';

const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
const respuestaChat = (content: string) => ok({ choices: [{ finish_reason: 'stop', message: { content } }] });

describe('modelo de MIA', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('Kimi va primero y Ollama de respaldo', () => {
    const p = proveedoresMia({ KIMI_API_KEY: 'k', OLLAMA_API_KEY: 'o' });
    expect(p.map((x) => `${x.nombre}:${x.modelo}`)).toEqual(['kimi:kimi-k2.6', 'ollama:gemma4:31b']);
    expect(p[0].baseUrl).toBe('https://api.moonshot.ai/v1');
    expect(crearMiaLlm({ KIMI_API_KEY: 'k', OLLAMA_API_KEY: 'o' })).toBeInstanceOf(MiaLlmConRespaldo);
    expect(crearMiaLlm({ KIMI_API_KEY: 'k' })).toBeInstanceOf(LlmCompatibleOpenAi);
    expect(crearMiaLlm({})).toBeNull();
  });

  it('a Kimi no le manda temperature (kimi-k2.6 solo acepta el default)', async () => {
    const fetchMock = jest.fn(async (_url: string, _init: { body: string }) => respuestaChat('ok'));
    global.fetch = fetchMock as never;
    const [kimi, ollama] = proveedoresMia({ KIMI_API_KEY: 'k', OLLAMA_API_KEY: 'o' }).map((p) => new LlmCompatibleOpenAi(p));
    const r = await kimi.completar([{ role: 'user', content: 'hola' }], []);
    await ollama.completar([{ role: 'user', content: 'hola' }], []);
    const [cuerpoKimi, cuerpoOllama] = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.moonshot.ai/v1/chat/completions');
    expect(cuerpoKimi).not.toHaveProperty('temperature');
    expect(cuerpoKimi.model).toBe('kimi-k2.6');
    expect(cuerpoOllama.temperature).toBe(0.2);
    expect(r).toMatchObject({ texto: 'ok', modelo: 'kimi:kimi-k2.6' });
  });

  it('a Kimi K2.6 se le apaga el razonamiento; a K3 (que razona siempre) y a Ollama no', async () => {
    const fetchMock = jest.fn(async (_url: string, _init: { body: string }) => respuestaChat('ok'));
    global.fetch = fetchMock as never;
    const [kimi, ollama] = proveedoresMia({ KIMI_API_KEY: 'k', OLLAMA_API_KEY: 'o' }).map((p) => new LlmCompatibleOpenAi(p));
    const [k3] = proveedoresMia({ KIMI_API_KEY: 'k', MIA_KIMI_MODEL: 'kimi-k3' }).map((p) => new LlmCompatibleOpenAi(p));
    for (const llm of [kimi, ollama, k3]) await llm.completar([{ role: 'user', content: 'hola' }], []);
    const [cuerpoKimi, cuerpoOllama, cuerpoK3] = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(cuerpoKimi.thinking).toEqual({ type: 'disabled' });
    expect(cuerpoOllama).not.toHaveProperty('thinking');
    expect(cuerpoK3).not.toHaveProperty('thinking');
  });

  it('si el primero falla, la misma vuelta se repite con el siguiente', async () => {
    const fallas: unknown[] = [];
    const sinSaldo: MiaLlm = { completar: jest.fn(async () => Promise.reject(new MiaLlmError('kimi HTTP 429: exceeded_current_quota_error', 429))) };
    const respaldo: MiaLlm = { completar: jest.fn(async () => ({ texto: 'hola', llamadas: [], cortada: false, modelo: 'ollama:gemma4:31b' })) };
    const r = await new MiaLlmConRespaldo([sinSaldo, respaldo], (e) => fallas.push(e)).completar([{ role: 'user', content: 'hola' }], []);
    expect(r.modelo).toBe('ollama:gemma4:31b');
    expect(fallas).toHaveLength(1);
  });

  it('si todos fallan, se lanza el error del primero', async () => {
    const a: MiaLlm = { completar: async () => Promise.reject(new MiaLlmError('a', 401)) };
    const b: MiaLlm = { completar: async () => Promise.reject(new MiaLlmError('b', 500)) };
    await expect(new MiaLlmConRespaldo([a, b]).completar([], [])).rejects.toMatchObject({ message: 'a', status: 401 });
  });

  it('distingue "sin saldo" de "demasiadas consultas"', () => {
    expect(esSinSaldo(new MiaLlmError('HTTP 429: you have reached your monthly usage limit', 429))).toBe(true);
    expect(esSinSaldo(new MiaLlmError('HTTP 429: exceeded_current_quota_error', 429))).toBe(true);
    expect(esSinSaldo(new MiaLlmError('HTTP 402: payment required', 402))).toBe(true);
    expect(esSinSaldo(new MiaLlmError('HTTP 429: rate limit reached, slow down', 429))).toBe(false);
  });
});
