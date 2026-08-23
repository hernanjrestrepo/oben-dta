import { ObenCostOrderRealAdapter } from './oben-cost-order.real';

const CTX = { tenantId: 't1', userId: 'u1' };

function makeAdapter() {
  return new ObenCostOrderRealAdapter({
    baseUrl: 'https://api.obengroup.co/api/External/APICostOrderParadixe',
    authToken: '6E0DC8BA-790C-47CD-A811-D2C7AC395E99',
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
          Authtoken: '6E0DC8BA-790C-47CD-A811-D2C7AC395E99',
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
});
