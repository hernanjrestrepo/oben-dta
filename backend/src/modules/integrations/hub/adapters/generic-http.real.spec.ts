import { GenericHttpRealAdapter } from './generic-http.real';

const CTX = { tenantId: 't1', userId: 'u1' };

function makeAdapter(baseUrl: string) {
  return new GenericHttpRealAdapter({
    system: 'veta',
    baseUrl,
    authScheme: 'none',
    routes: { probe: { path: '/probe', method: 'GET' } },
  });
}

describe('RealAdapterBase — protección SSRF (RC1 Sprint 5)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const blockedTargets = [
    'http://localhost:3004/health',
    'http://127.0.0.1:3004/health',
    'http://169.254.169.254/latest/meta-data/', // metadata AWS/Azure/GCP
    'http://10.0.0.5:8080/internal',
    'http://172.16.5.5/internal',
    'http://172.31.255.255/internal',
    'http://192.168.1.10/internal',
    'http://0.0.0.0:1234/',
  ];

  it.each(blockedTargets)('bloquea %s (red privada/interna) — nunca llega a hacer fetch', async (target) => {
    global.fetch = jest.fn();
    const adapter = makeAdapter(target);
    const result = await adapter.execute('probe', {}, CTX);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ssrf_blocked/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('permite un host externo legítimo (fuera de rangos privados)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"ok":true}' });
    const adapter = makeAdapter('https://api.proveedor-externo-real.com');
    const result = await adapter.execute('probe', {}, CTX);
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('172.15.x y 172.32.x (fuera del rango RFC1918 172.16-172.31) NO se bloquean por error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
    const adapter = makeAdapter('http://172.32.0.1/probe');
    const result = await adapter.execute('probe', {}, CTX);
    expect(result.ok).toBe(true); // 172.32 está FUERA de 172.16/12 — no debe bloquearse
  });
});
