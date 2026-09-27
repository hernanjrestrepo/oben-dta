import { StaticScenarioProvider } from '../static-scenario-provider';
import {
  ObenPlusCartera,
  ObenPlusCubicaje,
  ObenPlusMockAdapter,
  ObenPlusProformaList,
  ObenPlusProformaStatus,
  PROFORMA_ESTADOS,
} from './oben-plus.mock';

const CTX = { tenantId: 't1', userId: 'u1' };

describe('ObenPlusMockAdapter (Oben+ / OBEN MAS — SIMULADO)', () => {
  const adapter = new ObenPlusMockAdapter(new StaticScenarioProvider());
  const call = async <T>(op: string, args: Record<string, unknown>) => {
    const res = await adapter.execute<T>(op, args, CTX);
    return res;
  };
  const all = async () => (await call<ObenPlusProformaList>('proforma.list', {})).data!.proformas;

  it('se declara como mock del sistema obenPlus con las 4 operaciones', () => {
    expect(adapter.mode).toBe('mock');
    expect(adapter.system).toBe('obenPlus');
    expect(adapter.capabilities().map((c) => c.operation).sort()).toEqual(
      ['proforma.cartera', 'proforma.cubicaje', 'proforma.list', 'proforma.status'],
    );
  });

  it.each(['proforma.status', 'proforma.cartera', 'proforma.cubicaje', 'proforma.list'])(
    '%s marca TODO payload con simulated:true (nunca se confunde con un dato real)',
    async (op) => {
      const res = await call<{ simulated: boolean; proformas?: Array<{ simulated: boolean }> }>(op, { numberPF: '11271' });
      expect(res.ok).toBe(true);
      expect(res.mode).toBe('mock');
      expect(res.data!.simulated).toBe(true);
      for (const p of res.data!.proformas ?? []) expect(p.simulated).toBe(true);
    },
  );

  it('es determinista: la misma Proforma simula siempre lo mismo (también si llega como número)', async () => {
    const a = await call<ObenPlusProformaStatus>('proforma.status', { numberPF: '11271' });
    const b = await call<ObenPlusProformaStatus>('proforma.status', { numberPF: 11271 });
    expect(a.data).toEqual(b.data);
  });

  it('sin numberPF responde error de negocio (no inventa una Proforma)', async () => {
    const res = await call('proforma.status', {});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/BUSINESS_ERROR: numberPF requerido/);
  });

  it('el catálogo simulado usa el prefijo SIM- y cubre los 4 estados (útil para demos del dashboard)', async () => {
    const proformas = await all();
    expect(proformas.length).toBeGreaterThan(0);
    for (const p of proformas) expect(p.numberPF).toMatch(/^SIM-\d+$/);
    expect(new Set(proformas.map((p) => p.estado))).toEqual(new Set(PROFORMA_ESTADOS));
  });

  it('estado, cartera y cubicaje son coherentes entre sí para cada Proforma', async () => {
    for (const p of await all()) {
      const cartera = (await call<ObenPlusCartera>('proforma.cartera', { numberPF: p.numberPF })).data!;
      const cubicaje = (await call<ObenPlusCubicaje>('proforma.cubicaje', { numberPF: p.numberPF })).data!;

      expect(p.exportacion).toBe(p.pais !== 'COLOMBIA');
      expect(cartera.liberada).toBe(p.estado === 'activa');
      expect(cartera.fechaLiberacion === null).toBe(!cartera.liberada);
      if (p.estado === 'sin_cubicar') {
        expect(cubicaje.contenedoresPlaneados).toBe(0);
      } else {
        expect(cubicaje.contenedoresPlaneados).toBeGreaterThan(0);
      }
      expect(cubicaje.contenedoresCargados).toBeLessThanOrEqual(cubicaje.contenedoresPlaneados);
      if (p.estado !== 'activa') expect(cubicaje.contenedoresCargados).toBe(0);
      expect(cubicaje.pesoCargadoKg).toBeLessThanOrEqual(cubicaje.pesoPlaneadoKg);
      expect(p.direccionEntrega).toMatch(/SIMULADA/);
    }
  });

  it('las fechas de producción solo existen desde que la OV está retenida/activa y van en orden', async () => {
    for (const p of await all()) {
      const { creacion, produccionInicio, produccionFin, entregaComprometida } = p.fechas;
      if (p.estado === 'sin_cubicar' || p.estado === 'ubicada') {
        expect([produccionInicio, produccionFin, entregaComprometida]).toEqual([null, null, null]);
        continue;
      }
      expect(creacion <= produccionInicio!).toBe(true);
      expect(produccionInicio! <= produccionFin!).toBe(true);
      expect(produccionFin! <= entregaComprometida!).toBe(true);
    }
  });

  it('proforma.list filtra por cliente (sin distinguir mayúsculas) y por estado', async () => {
    const proformas = await all();
    const cliente = proformas[0].cliente;
    const porCliente = (await call<ObenPlusProformaList>('proforma.list', { cliente: cliente.toLowerCase() })).data!.proformas;
    expect(porCliente.length).toBeGreaterThan(0);
    expect(porCliente.every((p) => p.cliente === cliente)).toBe(true);

    const activas = (await call<ObenPlusProformaList>('proforma.list', { estado: 'activa' })).data!.proformas;
    expect(activas.every((p) => p.estado === 'activa')).toBe(true);

    const nadie = (await call<ObenPlusProformaList>('proforma.list', { cliente: 'NO EXISTE' })).data!.proformas;
    expect(nadie).toEqual([]);
  });

  it('proforma.list con un estado inválido responde error de negocio', async () => {
    const res = await call('proforma.list', { estado: 'aprobada' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/estado inválido/);
  });
});
