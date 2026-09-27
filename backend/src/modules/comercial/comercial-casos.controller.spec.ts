import { BadRequestException } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { REQUIRE_PERMISSION_KEY } from '../security/require-permission.decorator';
import { ComercialCasosController } from './comercial-casos.controller';
import { ComercialSimuladorService, EQUIVALENCIAS_DEMO, CLIENTE_DEMO } from './comercial-simulador.service';

describe('ComercialCasosController', () => {
  const proto = ComercialCasosController.prototype as unknown as Record<string, unknown>;
  const routes = Object.getOwnPropertyNames(proto)
    .filter((n) => n !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[n] as object) !== undefined)
    .map((n) => ({
      name: n,
      path: Reflect.getMetadata(PATH_METADATA, proto[n] as object) as string,
      method: Reflect.getMetadata(METHOD_METADATA, proto[n] as object) as number,
      perm: JSON.stringify(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto[n] as object)),
    }));

  it('toda ruta exige permiso: lectura orders.read, acciones orders.update/create, configuración configuracion.*', () => {
    expect(routes.length).toBeGreaterThanOrEqual(15);
    for (const r of routes) {
      const esperado = r.path.startsWith('configuracion')
        ? /configuracion\.(read|update)/
        : r.method === 0 /* GET */
          ? /orders\.read/
          : /orders\.(update|create)/;
      expect(`${r.name} ${r.perm}`).toMatch(esperado);
    }
  });

  it('"casos/tablero" se declara antes que "casos/:id"', () => {
    const paths = routes.map((r) => r.path);
    expect(paths.indexOf('casos/tablero')).toBeLessThan(paths.indexOf('casos/:id'));
  });

  it('confirmar exige confirm:true explícito (freno de mano)', () => {
    const flujo = { confirmar: jest.fn() };
    const c = new ComercialCasosController(flujo as never, {} as never);
    expect(() => c.confirmar('00000000-0000-0000-0000-000000000000', { confirm: false })).toThrow(BadRequestException);
    expect(flujo.confirmar).not.toHaveBeenCalled();
  });

  it('una OC manual pasa por el mismo camino que un correo (adjuntos en base64)', async () => {
    const flujo = { recibirOc: jest.fn().mockResolvedValue({ id: 'caso-1' }) };
    const c = new ComercialCasosController(flujo as never, {} as never);
    await c.recibirOc({ from: 'a@b.co', subject: 'OC', body: 'x', attachments: [{ filename: 'oc.pdf', contentBase64: Buffer.from('%PDF').toString('base64') }] });
    const [input, origen] = flujo.recibirOc.mock.calls[0];
    expect(origen).toBe('manual');
    expect(input.attachments[0].content.toString()).toBe('%PDF');
  });
});

describe('ComercialSimuladorService', () => {
  function make(obenPlusMode: 'mock' | 'real') {
    const hub = { capabilities: jest.fn().mockResolvedValue({ mode: obenPlusMode }), call: jest.fn().mockResolvedValue({ ok: true, data: { estado: 'cubicada' } }) };
    const clients = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((x: unknown) => x), save: jest.fn(async (x: object) => ({ id: 'cli-1', ...x })) };
    const equivalences = { findAll: jest.fn().mockResolvedValue([{ clientCode: 'BOPP 15' }]), create: jest.fn().mockResolvedValue({}) };
    const audit = { log: jest.fn() };
    const svc = new ComercialSimuladorService(
      hub as never,
      { tenantId: 't1', userId: 'u1' } as never,
      audit as never,
      clients as never,
      { count: jest.fn().mockResolvedValue(0), update: jest.fn() } as never,
      equivalences as never,
      {} as never,
      {} as never,
      { procesarVencidos: jest.fn().mockResolvedValue(3) } as never,
    );
    return { svc, clients, equivalences, hub };
  }

  it('con OBEN MAS real conectado, el simulador no existe', async () => {
    const { svc, hub } = make('real');
    await expect(svc.cargarDatosDemo()).rejects.toThrow(/solo existe mientras OBEN MAS/);
    await expect(svc.control('SIM-95001', 'cubicar')).rejects.toThrow(/solo existe/);
    expect(hub.call).not.toHaveBeenCalled();
  });

  it('datos demo: cliente con dominio de prueba (.example) y equivalencias con prefijo SIM-, sin duplicar', async () => {
    const { svc, clients, equivalences } = make('mock');
    const r = await svc.cargarDatosDemo();
    expect(clients.save).toHaveBeenCalledWith(expect.objectContaining({ clientId: CLIENTE_DEMO.clientId, authorizedDomains: ['cliente-simulado.example'] }));
    expect(r.equivalenciasCreadas).toBe(EQUIVALENCIAS_DEMO.length - 1);
    for (const [, oben] of EQUIVALENCIAS_DEMO) expect(oben).toMatch(/^SIM-/);
    expect(equivalences.create).not.toHaveBeenCalledWith(expect.objectContaining({ clientCode: 'BOPP 15' }));
  });

  it('controles: cada uno llama la operación sim.* correspondiente; uno desconocido se rechaza', async () => {
    const { svc, hub } = make('mock');
    await svc.control('SIM-95001', 'liberar-cartera');
    expect(hub.call).toHaveBeenCalledWith('obenPlus', 'sim.liberarCartera', { numberPF: 'SIM-95001' }, expect.anything());
    await svc.control('SIM-95001', 'cambiar-entrega', '2026-11-02');
    expect(hub.call).toHaveBeenLastCalledWith('obenPlus', 'sim.cambiarEntrega', { numberPF: 'SIM-95001', fecha: '2026-11-02' }, expect.anything());
    await expect(svc.control('SIM-95001', 'volar' as never)).rejects.toThrow(/Control desconocido/);
  });
});
