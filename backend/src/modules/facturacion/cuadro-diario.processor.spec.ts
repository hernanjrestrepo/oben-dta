import { CuadroDiarioProcessor } from './cuadro-diario.processor';

describe('CuadroDiarioProcessor (27-oct): el cuadro del día se carga solo desde SharePoint', () => {
  const armar = (tenants: Array<Record<string, unknown>>, cargar: jest.Mock) => {
    const ctxs: string[] = [];
    const moduleRef = {
      resolve: jest.fn(async (token: { name: string }) => (token.name === 'TenantContext' ? { setContext: (t: string) => ctxs.push(t) } : { cargar })),
    };
    const repo = { find: jest.fn(async () => tenants) };
    return { p: new CuadroDiarioProcessor(repo as never, moduleRef as never), ctxs };
  };

  it('carga solo los tenants con programación diaria activa; un tenant apagado o sin Excel no frena a los demás', async () => {
    const cargar = jest.fn().mockResolvedValueOnce({ fecha: '2026-10-27', cargadas: 21, excluidas: 1 }).mockRejectedValueOnce(new Error('sin permiso'));
    const { p, ctxs } = armar(
      [
        { id: 'a', settings: { facturacion: { soloProgramadas: true } } },
        { id: 'b', settings: { facturacion: { soloProgramadas: false } } },
        { id: 'c', settings: { facturacion: { soloProgramadas: true, cargaAutomaticaCuadro: false } } },
        { id: 'd', settings: { facturacion: { soloProgramadas: true } } },
      ],
      cargar,
    );
    await p.ciclo();
    expect(ctxs).toEqual(['a', 'd']);
    expect(cargar).toHaveBeenCalledTimes(2);
  });
});
