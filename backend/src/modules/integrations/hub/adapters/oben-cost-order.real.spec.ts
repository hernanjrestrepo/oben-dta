import { ObenCostOrderRealAdapter } from './oben-cost-order.real';

const CTX = { tenantId: 't1', userId: 'u1' };

function makeAdapter() {
  return new ObenCostOrderRealAdapter({
    baseUrl: 'https://api.obengroup.co/api/External/APICostOrderParadixe',
    consultaUrl: 'https://api.obengroup.co/api/External/APIConsultaParadixe',
    authToken: '00000000-0000-0000-0000-000000000000',
  });
}

describe('ObenCostOrderRealAdapter (API real de costos de orden de Oben)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('envía Authtoken/NumberOrderSales/Linea como headers, sin body, en POST', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ Referencia: 'ET012RT', SumaCostoTotal: 26400.35 }),
    });

    const adapter = makeAdapter();
    const result = await adapter.execute(
      'costOrder.get',
      { numberOrderSales: 10794, linea: 3 },
      CTX,
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ Referencia: 'ET012RT', SumaCostoTotal: 26400.35 });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.obengroup.co/api/External/APICostOrderParadixe',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authtoken: '00000000-0000-0000-0000-000000000000',
          NumberOrderSales: '10794',
          Linea: '3',
        }),
      }),
    );
  });

  it('rechaza sin llamar a fetch si falta numberOrderSales o linea', async () => {
    global.fetch = jest.fn();
    const adapter = makeAdapter();

    const r1 = await adapter.execute('costOrder.get', { linea: 3 }, CTX);
    expect(r1.ok).toBe(false);
    expect(r1.error).toMatch(/numberOrderSales requerido/);

    const r2 = await adapter.execute(
      'costOrder.get',
      { numberOrderSales: 10794 },
      CTX,
    );
    expect(r2.ok).toBe(false);
    expect(r2.error).toMatch(/linea requerido/);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reporta pending_credentials si falta baseUrl o authToken', async () => {
    const adapter = new ObenCostOrderRealAdapter({ baseUrl: undefined, authToken: undefined });
    const result = await adapter.execute(
      'costOrder.get',
      { numberOrderSales: 1, linea: 1 },
      CTX,
    );
    expect(result.state).toBe('pending_credentials');
  });

  describe('query.run (APIConsultaParadixe, endpoint genérico multi-SP)', () => {
    it('envía Authtoken/NombreConsulta/NumberOrderSales como headers, sin body, en POST', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ OrdenVenta: '10794', Detalle: [] }),
      });

      const adapter = makeAdapter();
      const result = await adapter.execute(
        'query.run',
        { procedure: 'spConsumoMP_Paradixe', numberOrderSales: 10794 },
        CTX,
      );

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ OrdenVenta: '10794', Detalle: [] });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.obengroup.co/api/External/APIConsultaParadixe',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authtoken: '00000000-0000-0000-0000-000000000000',
            NombreConsulta: 'spConsumoMP_Paradixe',
            NumberOrderSales: '10794',
          }),
        }),
      );
    });

    it('funciona con cualquier nombre de stored procedure (genérico, no hardcodeado)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      });
      const adapter = makeAdapter();
      await adapter.execute(
        'query.run',
        { procedure: 'spPackingListUSA_Paradixe', numberOrderSales: 10794 },
        CTX,
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ NombreConsulta: 'spPackingListUSA_Paradixe' }),
        }),
      );
    });

    it('rechaza sin llamar a fetch si falta procedure o numberOrderSales', async () => {
      global.fetch = jest.fn();
      const adapter = makeAdapter();

      const r1 = await adapter.execute('query.run', { numberOrderSales: 10794 }, CTX);
      expect(r1.ok).toBe(false);
      expect(r1.error).toMatch(/procedure requerido/);

      const r2 = await adapter.execute('query.run', { procedure: 'spConsumoMP_Paradixe' }, CTX);
      expect(r2.ok).toBe(false);
      expect(r2.error).toMatch(/numberOrderSales requerido/);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('reporta pending_credentials si falta consultaUrl específicamente', async () => {
      const adapter = new ObenCostOrderRealAdapter({
        authToken: '00000000-0000-0000-0000-000000000000',
        consultaUrl: undefined,
      });
      const result = await adapter.execute(
        'query.run',
        { procedure: 'spConsumoMP_Paradixe', numberOrderSales: 10794 },
        CTX,
      );
      expect(result.state).toBe('pending_credentials');
    });
  });
});
