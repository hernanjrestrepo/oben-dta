import { BadRequestException } from '@nestjs/common';
import { ComercialMaestrosService } from './comercial-maestros.service';
import { ObenCostOrderRealAdapter } from '../integrations/hub/adapters/oben-cost-order.real';
import { COMERCIAL_URL_PRUEBAS } from '../integrations/hub/adapters/oben-comercial';

const CTX = { tenantId: 't1', userId: 'u1' };
const CLIENTES = [
  { CodSec_Entity: 11, Nombre_Cliente: 'VIDEPLAST INDÚSTRIA DE EMBALAGENS', Pais_Cliente: 'BRASIL', CodSed_CustomerAddress: 501 },
  { CodSec_Entity: 12, Nombre_Cliente: 'MINIPAK S.A.S.', Pais_Cliente: 'COLOMBIA', CodSed_CustomerAddress: 502 },
];

function armar(respuesta: (args: Record<string, unknown>) => { ok: boolean; data?: unknown; error?: string; mode?: string }) {
  const hub = { call: jest.fn(async (_s: string, _op: string, args: Record<string, unknown>) => respuesta(args)) };
  return { svc: new ComercialMaestrosService(hub as never, { tenantId: 't1' } as never), hub };
}

describe('maestros comerciales de Oben (APIs del Excel comercial, servidor de pruebas)', () => {
  it('trae el maestro, busca sin tildes ni mayúsculas y lo guarda una hora (no vuelve a pedir 3,6 MB)', async () => {
    const { svc, hub } = armar(() => ({ ok: true, data: CLIENTES, mode: 'real' }));
    const r = await svc.maestro('clientes', { buscar: 'industria' });
    expect(r).toMatchObject({ maestro: 'clientes', total: 1, simulado: false });
    expect(r.items[0].CodSec_Entity).toBe(11);
    await svc.maestro('clientes');
    expect(hub.call).toHaveBeenCalledTimes(1);
    await svc.maestro('clientes', { refrescar: true });
    expect(hub.call).toHaveBeenCalledTimes(2);
    expect(hub.call.mock.calls[0][2]).toEqual({ maestro: 'clientes' });
  });

  it('las consultas con parámetros no se piden como maestro', async () => {
    const { svc } = armar(() => ({ ok: true, data: [] }));
    await expect(svc.maestro('validarEmpaque')).rejects.toThrow(BadRequestException);
    await expect(svc.maestro('inventado')).rejects.toThrow(/no es un maestro/);
  });

  it('validación de empaque: Oben responde 200 en los dos casos, se distingue por el texto', async () => {
    const ok = await armar(() => ({ ok: true, data: 'OK' })).svc.validarEmpaque({ codSecEntity: 11, codSecEntityAddress: 501, codSecProduct: 7001, codSecCity: 3 });
    expect(ok.valido).toBe(true);
    const no = await armar(() => ({ ok: true, data: 'No se encontró Maestro de Empaque para el producto seleccionado y su destino.' })).svc.validarEmpaque({
      codSecEntity: 11,
      codSecEntityAddress: 501,
      codSecProduct: 1,
      codSecCity: 3,
    });
    expect(no).toMatchObject({ valido: false, mensaje: expect.stringContaining('No se encontró Maestro de Empaque') });
    await expect(armar(() => ({ ok: true, data: 'OK' })).svc.validarEmpaque({ codSecEntity: 0, codSecEntityAddress: 1, codSecProduct: 1, codSecCity: 1 })).rejects.toThrow(/codSecEntity/);
  });

  it('la parametrización rechazada por Oben se explica (pendiente con José)', async () => {
    const { svc } = armar(() => ({ ok: false, error: 'HTTP 400: No se pudo consultar con los parámetros suministrados' }));
    await expect(svc.parametrizacion({ codSecEntity: 11, targetCustomer: 'X' })).rejects.toThrow(/TargetCustomer/);
  });
});

describe('adapter real: APIs comerciales', () => {
  const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify([{ CodSec_City: 1 }]), { status: 200 }));
  beforeEach(() => {
    fetchMock.mockClear();
    global.fetch = fetchMock as never;
  });

  it('por defecto apunta al servidor de PRUEBAS, con el nombre real de la API de ciudades', async () => {
    const a = new ObenCostOrderRealAdapter({ authToken: 'tok' } as never);
    await a.execute('comercial.consultar', { maestro: 'ciudades' }, CTX);
    expect(fetchMock.mock.calls[0][0]).toBe(`${COMERCIAL_URL_PRUEBAS}/APICityStateCountryParadixe`);
  });

  it('los parámetros van como encabezados y `comercialUrl` permite pasar a producción', async () => {
    const a = new ObenCostOrderRealAdapter({ authToken: 'tok', comercialUrl: 'https://api.obengroup.co/api/External/' } as never);
    await a.execute('comercial.consultar', { maestro: 'validarEmpaque', parametros: { codSecEntity: 11, codSecEntityAddress: 501, codSecProduct: 7001, codSecCity: 3 } }, CTX);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.obengroup.co/api/External/APIValidProductMasterEmpaqueParadixe');
    expect(init?.headers).toMatchObject({ Authtoken: 'tok', CodSecEntity: '11', CodSecEntityAddress: '501', CodSecProduct: '7001', CodSecCity: '3' });
  });

  it('un maestro desconocido no se llama', async () => {
    const a = new ObenCostOrderRealAdapter({ authToken: 'tok' } as never);
    const r = await a.execute('comercial.consultar', { maestro: 'APIActivateOVParadixe' }, CTX);
    expect(r.ok).toBe(false);
    expect(String(r.error)).toMatch(/desconocido/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
