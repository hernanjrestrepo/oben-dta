import { BadRequestException } from '@nestjs/common';
import { ComercialService } from './comercial.service';
import { ObenPlusMockAdapter } from '../integrations/hub/adapters/oben-plus.mock';
import { StaticScenarioProvider } from '../integrations/hub/static-scenario-provider';
import type { AdapterCallResult } from '../integrations/hub/adapter.types';

const CTX = { tenantId: 't1', userId: 'u1' };
const DAY_MS = 24 * 60 * 60 * 1000;
const day = (offset: number) => new Date(Date.parse(new Date().toISOString().slice(0, 10)) + offset * DAY_MS).toISOString().slice(0, 10);

/** Hub delgado que enruta `obenPlus` al simulador REAL del repo (no a un doble ad hoc). */
function withSimulator() {
  const adapter = new ObenPlusMockAdapter(new StaticScenarioProvider());
  const hub = {
    call: jest.fn((system: string, op: string, args: Record<string, unknown>, _options?: unknown) => {
      if (system !== 'obenPlus') throw new Error(`sistema inesperado ${system}`);
      return adapter.execute(op, args, CTX);
    }),
  };
  return { service: new ComercialService(hub as never), hub };
}

/** Hub con respuestas fabricadas por operación, para errores y formas inválidas. */
function withResponses(responses: Record<string, Partial<AdapterCallResult<unknown>>>) {
  const hub = {
    call: jest.fn(async (_system: string, op: string) => ({
      ok: true,
      mode: 'mock',
      state: 'operational',
      durationMs: 0,
      system: 'obenPlus',
      operation: op,
      ...responses[op],
    })),
  };
  return { service: new ComercialService(hub as never), hub };
}

const STATUS = (over: Record<string, unknown> = {}) => ({
  data: {
    numberPF: '11271',
    cliente: 'OBEN US, LLC',
    estado: 'activa',
    exportacion: true,
    pais: 'USA',
    direccionEntrega: '1 Port Rd',
    fechas: { creacion: day(-20), produccionInicio: day(-15), produccionFin: day(-10), entregaComprometida: day(10) },
    ...over,
  },
});
const CARTERA = (over: Record<string, unknown> = {}) => ({ data: { liberada: true, fechaLiberacion: day(-18), observacion: null, ...over } });
const CUBICAJE = (over: Record<string, unknown> = {}) => ({
  data: {
    tipoContenedor: '40HC',
    contenedoresPlaneados: 2,
    contenedoresCargados: 1,
    pesoPlaneadoKg: 44000,
    pesoCargadoKg: 22000,
    volumenPlaneadoM3: 136,
    volumenCargadoM3: 68,
    ...over,
  },
});

describe('ComercialService — seguimiento de Proformas (Oben+)', () => {
  describe('contra el simulador obenPlus', () => {
    it('arma el seguimiento completo y declara que TODO salió del simulador', async () => {
      const { service } = withSimulator();

      const t = await service.getProforma('SIM-90001');

      expect(t.simulated).toBe(true);
      expect(t.fuentes).toEqual({ status: 'mock', cartera: 'mock', cubicaje: 'mock' });
      expect(t.missing).toEqual([]);
      expect(t.estado).toEqual(expect.any(String));
      expect(t.cliente).toEqual(expect.any(String));
      expect(t.cartera).toEqual(expect.objectContaining({ liberada: expect.any(Boolean) }));
      expect(t.cubicaje).toEqual(expect.objectContaining({ contenedoresPlaneados: expect.any(Number) }));
      expect(t.siguientePaso).toEqual(expect.any(String));
    });

    it('consulta estado → cartera → cubicaje en ese orden, uno a la vez, con OBEN_QUERY_OPTIONS', async () => {
      const { service, hub } = withSimulator();
      await service.getProforma('11271');
      expect(hub.call.mock.calls.map((c) => c[1])).toEqual(['proforma.status', 'proforma.cartera', 'proforma.cubicaje']);
      for (const c of hub.call.mock.calls) expect(c[3]).toEqual({ maxAttempts: 1, timeoutMs: 30_000 });
    });

    it('el tablero cuadra: por estado, pendientes+activas, exportación+nacional y por cliente suman el total', async () => {
      const { service } = withSimulator();

      const d = await service.dashboard();

      expect(d.simulated).toBe(true);
      expect(d.fuentes).toEqual({ list: 'mock' });
      const t = d.totales;
      expect(t.total).toBeGreaterThan(0);
      expect(Object.values(d.porEstado).reduce((a, b) => a + b, 0)).toBe(t.total);
      expect(t.pendientes + t.activas).toBe(t.total);
      expect(t.exportacion + t.nacional).toBe(t.total);
      expect(d.porCliente.reduce((a, c) => a + c.total, 0)).toBe(t.total);
      expect(d.retenidasPorCartera).toHaveLength(d.porEstado.retenida);
      const fechas = d.proximasEntregas.map((e) => e.entregaComprometida);
      expect(fechas).toEqual([...fechas].sort());
      for (const e of d.proximasEntregas) expect(e.entregaComprometida <= day(14)).toBe(true);
      expect(d.missing).toEqual([]);
    });

    it('filtra por cliente y estado, y cada Proforma del listado coincide con su seguimiento individual', async () => {
      const { service } = withSimulator();
      const all = await service.listProformas();
      const { cliente } = all.proformas[0];

      const porCliente = await service.listProformas({ cliente: `  ${cliente}  ` });
      expect(porCliente.proformas.length).toBeGreaterThan(0);
      expect(porCliente.proformas.every((p) => p.cliente === cliente)).toBe(true);

      const detalle = await service.getProforma(porCliente.proformas[0].numberPF);
      expect(detalle).toMatchObject({ cliente, estado: porCliente.proformas[0].estado });
    });
  });

  describe('datos faltantes o inválidos: se listan, nunca se rellenan', () => {
    it('si cartera falla, se lista como faltante y el resto del seguimiento sigue', async () => {
      const { service } = withResponses({
        'proforma.status': STATUS(),
        'proforma.cartera': { ok: false, data: undefined, error: 'timeout: sin respuesta tras 30000ms' },
        'proforma.cubicaje': CUBICAJE(),
      });

      const t = await service.getProforma('11271');

      expect(t.cartera).toBeNull();
      expect(t.estado).toBe('activa');
      expect(t.cubicaje?.avanceCargaPct).toBe(50);
      expect(t.missing).toEqual([expect.stringContaining('Cartera: no se pudo consultar Oben+ (timeout')]);
    });

    it('un estado que no es del contrato NO se interpreta: estado=null y se lista', async () => {
      const { service } = withResponses({
        'proforma.status': STATUS({ estado: 'aprobada' }),
        'proforma.cartera': CARTERA(),
        'proforma.cubicaje': CUBICAJE(),
      });

      const t = await service.getProforma('11271');

      expect(t.estado).toBeNull();
      expect(t.siguientePaso).toBeNull();
      expect(t.missing).toEqual([expect.stringContaining('Estado de la Proforma: Oben+ no devolvió datos válidos')]);
    });

    it('Proforma inexistente (respuesta vacía) → los 3 bloques quedan como faltantes', async () => {
      const { service } = withResponses({
        'proforma.status': { data: undefined },
        'proforma.cartera': { data: undefined },
        'proforma.cubicaje': { data: undefined },
      });
      const t = await service.getProforma('99999');
      expect(t.missing).toHaveLength(3);
      expect([t.estado, t.cartera, t.cubicaje]).toEqual([null, null, null]);
    });

    it('un cubicaje con cantidades negativas o texto se rechaza (no se muestra un avance falso)', async () => {
      const { service } = withResponses({
        'proforma.status': STATUS(),
        'proforma.cartera': CARTERA(),
        'proforma.cubicaje': CUBICAJE({ contenedoresCargados: -1, pesoPlaneadoKg: '44000' }),
      });
      const t = await service.getProforma('11271');
      expect(t.cubicaje).toBeNull();
      expect(t.missing).toEqual([expect.stringContaining('Cubicaje')]);
    });

    it('filas inválidas del listado no se muestran pero se reportan en missing', async () => {
      const { service } = withResponses({
        'proforma.list': { data: { proformas: [STATUS().data, { numberPF: 'X' }, STATUS({ numberPF: '2', estado: 'retenida' }).data] } },
      });
      const r = await service.listProformas();
      expect(r.proformas.map((p) => p.numberPF)).toEqual(['11271', '2']);
      expect(r.missing).toEqual(['1 Proforma(s) llegaron de Oben+ con datos inválidos y no se muestran.']);
    });

    it('si Oben+ no responde el listado, el tablero falla con un error claro (no muestra ceros que parezcan reales)', async () => {
      const { service } = withResponses({ 'proforma.list': { ok: false, error: 'circuit_open' } });
      await expect(service.dashboard()).rejects.toThrow(/No se pudo consultar las Proformas en Oben\+: circuit_open/);
    });
  });

  describe('simulated sigue a la fuente: conectar la API real no requiere cambiar este servicio', () => {
    it('con las 3 fuentes en modo real y sin marca simulated → simulated:false', async () => {
      const { service } = withResponses({
        'proforma.status': { mode: 'real', ...STATUS() },
        'proforma.cartera': { mode: 'real', ...CARTERA() },
        'proforma.cubicaje': { mode: 'real', ...CUBICAJE() },
      });
      const t = await service.getProforma('11271');
      expect(t.simulated).toBe(false);
      expect(t.fuentes).toEqual({ status: 'real', cartera: 'real', cubicaje: 'real' });
    });

    it('basta UNA fuente simulada para que toda la respuesta quede marcada como simulada', async () => {
      const { service } = withResponses({
        'proforma.status': { mode: 'real', ...STATUS() },
        'proforma.cartera': { mode: 'mock', ...CARTERA() },
        'proforma.cubicaje': { mode: 'real', ...CUBICAJE() },
      });
      expect((await service.getProforma('11271')).simulated).toBe(true);
    });

    it('un payload con simulated:true cuenta como simulado aunque el modo diga real', async () => {
      const { service } = withResponses({ 'proforma.list': { mode: 'real', data: { simulated: true, proformas: [] } } });
      expect((await service.dashboard()).simulated).toBe(true);
    });
  });

  describe('siguiente paso y alertas (solo a partir de datos devueltos)', () => {
    it.each([
      ['sin_cubicar', /Cubicaje/],
      ['ubicada', /aprueba \/ rechaza \/ modifica/],
      ['retenida', /cartera/],
      ['activa', /Lista de Empaque/],
    ])('estado %s → siguiente paso %s', async (estado, paso) => {
      const { service } = withResponses({
        'proforma.status': STATUS({ estado }),
        'proforma.cartera': CARTERA({ liberada: estado === 'activa' }),
        'proforma.cubicaje': CUBICAJE(),
      });
      expect((await service.getProforma('11271')).siguientePaso).toMatch(paso);
    });

    it('retenida con cartera sin liberar → alerta con la observación de cartera', async () => {
      const { service } = withResponses({
        'proforma.status': STATUS({ estado: 'retenida' }),
        'proforma.cartera': CARTERA({ liberada: false, fechaLiberacion: null, observacion: 'Cupo excedido' }),
        'proforma.cubicaje': CUBICAJE({ contenedoresCargados: 0 }),
      });
      expect((await service.getProforma('11271')).alertas).toEqual(['Retenida por cartera: Cupo excedido']);
    });

    it('activa sin liberación de cartera → alerta de inconsistencia de datos', async () => {
      const { service } = withResponses({
        'proforma.status': STATUS(),
        'proforma.cartera': CARTERA({ liberada: false }),
        'proforma.cubicaje': CUBICAJE(),
      });
      expect((await service.getProforma('11271')).alertas).toEqual([expect.stringContaining('Inconsistencia')]);
    });

    it('entrega comprometida vencida sin carga completa → alerta; con carga completa → no', async () => {
      const vencida = STATUS({ fechas: { creacion: day(-30), produccionInicio: day(-25), produccionFin: day(-20), entregaComprometida: day(-1) } });
      const incompleta = withResponses({ 'proforma.status': vencida, 'proforma.cartera': CARTERA(), 'proforma.cubicaje': CUBICAJE() });
      expect((await incompleta.service.getProforma('11271')).alertas).toEqual([expect.stringContaining('ya pasó')]);

      const completa = withResponses({
        'proforma.status': vencida,
        'proforma.cartera': CARTERA(),
        'proforma.cubicaje': CUBICAJE({ contenedoresCargados: 2 }),
      });
      expect((await completa.service.getProforma('11271')).alertas).toEqual([]);
    });
  });

  describe('validación de entrada (antes de llamar a Oben+)', () => {
    it.each(['', '   ', "11271'; DROP", 'a'.repeat(33)])('numberPF %j se rechaza', async (pf) => {
      const { service, hub } = withSimulator();
      await expect(service.getProforma(pf)).rejects.toThrow(BadRequestException);
      expect(hub.call).not.toHaveBeenCalled();
    });

    it('un estado de filtro inválido se rechaza', async () => {
      const { service, hub } = withSimulator();
      await expect(service.listProformas({ estado: 'aprobada' })).rejects.toThrow(/estado inválido/);
      expect(hub.call).not.toHaveBeenCalled();
    });
  });
});
