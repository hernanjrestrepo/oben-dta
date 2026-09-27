import { PackingListCarteraService } from './packing-list-cartera.service';

function make(opts: {
  cartera?: { ok: boolean; mode: 'mock' | 'real'; data?: Record<string, unknown>; error?: string };
  costOrderMode?: 'mock' | 'real';
  settings?: Record<string, unknown>;
}) {
  const hub = {
    call: jest.fn().mockResolvedValue(opts.cartera ?? { ok: true, mode: 'real', data: { liberada: true } }),
    capabilities: jest.fn().mockResolvedValue({ mode: opts.costOrderMode ?? 'real' }),
  };
  const tenants = { findOne: jest.fn().mockResolvedValue({ settings: opts.settings ?? {} }) };
  const service = new PackingListCarteraService(hub as never, { tenantId: 't1', userId: null } as never, tenants as never);
  return { service, hub };
}

describe('PackingListCarteraService — regla PND (Producir No Despachar)', () => {
  it('consulta obenPlus → ov.cartera con la OV, una sola vez y sin reintentos (API de Oben sin concurrencia)', async () => {
    const { service, hub } = make({});
    await service.evaluar(10824);
    expect(hub.call).toHaveBeenCalledWith('obenPlus', 'ov.cartera', { numberOrderSales: 10824 }, expect.objectContaining({ maxAttempts: 1 }));
  });

  describe('con la fuente REAL de cartera', () => {
    it('liberada → continuar, verificada', async () => {
      const { service } = make({ cartera: { ok: true, mode: 'real', data: { liberada: true } } });
      await expect(service.evaluar(1)).resolves.toMatchObject({ action: 'continuar', verificada: true, simulated: false });
    });

    it('no liberada → retener (PND), con la observación de cartera', async () => {
      const { service } = make({ cartera: { ok: true, mode: 'real', data: { liberada: false, pnd: true, observacion: 'Sin cupo' } } });
      await expect(service.evaluar(1)).resolves.toMatchObject({ action: 'retener', pnd: true, simulated: false, observacion: 'Sin cupo' });
    });

    it('la consulta falla → reintentar (nunca se asume liberada)', async () => {
      const { service } = make({ cartera: { ok: false, mode: 'real', error: 'HTTP 500' } });
      await expect(service.evaluar(1)).resolves.toMatchObject({ action: 'reintentar', motivo: expect.stringContaining('HTTP 500') });
    });

    it('respuesta sin el campo "liberada" → reintentar (no se adivina)', async () => {
      const { service } = make({ cartera: { ok: true, mode: 'real', data: { estado: 'ok' } } });
      await expect(service.evaluar(1)).resolves.toMatchObject({ action: 'reintentar', motivo: expect.stringContaining('liberada') });
    });
  });

  describe('candado: un dato SIMULADO nunca decide sobre documentos reales', () => {
    it('cartera simulada + documentos reales (producción hoy) → continuar SIN verificar, aunque el simulador diga "no liberada"', async () => {
      const { service } = make({
        cartera: { ok: true, mode: 'mock', data: { simulated: true, liberada: false, pnd: true } },
        costOrderMode: 'real',
      });
      const d = await service.evaluar(1);
      expect(d).toMatchObject({ action: 'continuar', verificada: false, simulated: true });
      expect(d.motivo).toMatch(/SIMULADA/);
    });

    it('también si el adapter "real" devuelve un payload marcado simulated:true', async () => {
      const { service } = make({ cartera: { ok: true, mode: 'real', data: { simulated: true, liberada: false } }, costOrderMode: 'real' });
      await expect(service.evaluar(1)).resolves.toMatchObject({ action: 'continuar', verificada: false });
    });

    it('entorno 100 % simulado → sí retiene con el dato simulado (y lo marca)', async () => {
      const { service } = make({ cartera: { ok: true, mode: 'mock', data: { simulated: true, liberada: false, pnd: true } }, costOrderMode: 'mock' });
      await expect(service.evaluar(1)).resolves.toMatchObject({ action: 'retener', simulated: true, pnd: true });
    });
  });

  it('interruptor de emergencia: settings.packingList.verificarCartera=false → continuar sin consultar', async () => {
    const { service, hub } = make({ settings: { packingList: { verificarCartera: false } } });
    await expect(service.evaluar(1)).resolves.toMatchObject({ action: 'continuar', verificada: false });
    expect(hub.call).not.toHaveBeenCalled();
  });
});
