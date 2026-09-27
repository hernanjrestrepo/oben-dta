import { inflateSync } from 'zlib';
import { StaticScenarioProvider } from '../static-scenario-provider';
import { InMemoryObenPlusSimStore } from '../oben-plus-sim.store';
import {
  ObenPlusCartera,
  ObenPlusCliente,
  ObenPlusCubicaje,
  ObenPlusOvCartera,
  ObenPlusMockAdapter,
  ObenPlusProformaList,
  ObenPlusProformaPdf,
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

  it('se declara como mock del sistema obenPlus: lecturas, escrituras (contrato de los SP) y controles del simulador', () => {
    expect(adapter.mode).toBe('mock');
    expect(adapter.system).toBe('obenPlus');
    const caps = adapter.capabilities();
    expect(caps.filter((c) => c.method === 'read').map((c) => c.operation).sort()).toEqual([
      'cliente.consultar',
      'ov.cartera',
      'proforma.cartera',
      'proforma.cubicaje',
      'proforma.list',
      'proforma.pdf',
      'proforma.status',
    ]);
    expect(caps.filter((c) => c.method === 'write').map((c) => c.operation).sort()).toEqual([
      'ov.activar',
      'proforma.anular',
      'proforma.aprobar',
      'proforma.crear',
      'proforma.modificar',
      'sim.cambiarEntrega',
      'sim.cubicar',
      'sim.liberarCartera',
      'sim.producirNoDespachar',
    ]);
    for (const c of caps.filter((c) => c.operation.startsWith('sim.'))) expect(c.description).toMatch(/^SOLO SIMULADOR/);
  });

  it.each(['proforma.status', 'proforma.cartera', 'proforma.cubicaje', 'proforma.list', 'proforma.pdf', 'ov.cartera', 'cliente.consultar'])(
    '%s marca TODO payload con simulated:true (nunca se confunde con un dato real)',
    async (op) => {
      const res = await call<{ simulated: boolean; proformas?: Array<{ simulated: boolean }> }>(op, {
        numberPF: '11271',
        numberOrderSales: 11271,
        codigoCliente: 'C-1',
      });
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
      // Cartera solo libera órdenes activas, pero una activa puede seguir sin
      // liberar: eso es PND (Producir No Despachar).
      if (cartera.liberada) expect(p.estado).toBe('activa');
      expect(cartera.pnd).toBe(p.estado === 'activa' && !cartera.liberada);
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
      if (p.estado === 'sin_cubicar' || p.estado === 'cubicada') {
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

  it('proforma.pdf entrega un PDF válido, rotulado como PROFORMA SIMULADA, con nombre de archivo "SIMULADA"', async () => {
    const res = await call<ObenPlusProformaPdf>('proforma.pdf', { numberPF: '11271' });
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ simulated: true, numberPF: '11271', filename: 'Proforma_SIMULADA-PF11271.pdf', contentType: 'application/pdf' });

    const pdf = Buffer.from(res.data!.contentBase64, 'base64');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    // Texto visible del PDF (content streams de pdfkit, hex WinAnsi dentro de TJ).
    const raw = pdf.toString('latin1');
    const texts: string[] = [];
    for (const m of raw.matchAll(/stream\r?\n/g)) {
      const start = m.index + m[0].length;
      let content: string;
      try {
        content = inflateSync(Buffer.from(raw.slice(start, raw.indexOf('endstream', start)), 'latin1')).toString('latin1');
      } catch {
        continue;
      }
      for (const tj of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
        texts.push(Buffer.from([...tj[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]).join(''), 'hex').toString('latin1'));
      }
    }
    const visible = texts.join('').replace(/\s+/g, '');
    expect(visible).toContain('PROFORMASIMULADA');
    expect(visible).toContain('NOeseldocumentooficial');
  });

  it('el catálogo simulado incluye al menos una orden PND (activa sin cartera liberada) para demos', async () => {
    const pnd: string[] = [];
    for (const p of await all()) {
      const c = (await call<ObenPlusCartera>('proforma.cartera', { numberPF: p.numberPF })).data!;
      if (c.pnd) pnd.push(p.numberPF);
    }
    expect(pnd.length).toBeGreaterThan(0);
  });

  it('ov.cartera de una OV desconocida es determinista y simula tanto liberadas como PND', async () => {
    const results: ObenPlusOvCartera[] = [];
    for (let ov = 11000; ov < 11040; ov++) {
      results.push((await call<ObenPlusOvCartera>('ov.cartera', { numberOrderSales: ov })).data!);
    }
    expect(results.some((r) => r.liberada)).toBe(true);
    expect(results.some((r) => r.pnd)).toBe(true);
    for (const r of results) expect(r.pnd).toBe(!r.liberada);
    const again = (await call<ObenPlusOvCartera>('ov.cartera', { numberOrderSales: 11000 })).data!;
    expect(again).toEqual(results[0]);
  });
});

describe('ObenPlusMockAdapter — ciclo de vida de una Proforma creada en el simulador', () => {
  const LINEAS = [
    { codigoOben: 'SC15TN', descripcion: 'BOPP transparente 15 µm', kilos: 1030, anchoMm: 425, espesorMicras: 15 },
    { codigoOben: 'ET12', kilos: 480, anchoMm: 800 },
  ];
  const BASE = { codigoCliente: 'SIM-CLI-01', cliente: 'CLIENTE SIMULADO A', direccionEntrega: 'Bodega 1', pais: 'Ecuador', lineas: LINEAS };

  function fresh() {
    const adapter = new ObenPlusMockAdapter(new StaticScenarioProvider(), new InMemoryObenPlusSimStore());
    const call = async <T>(op: string, args: Record<string, unknown>, tenantId = 't1') => adapter.execute<T>(op, args, { tenantId, userId: 'u1' });
    return { call };
  }

  it('crear exige cliente, dirección, país y líneas con código y kilos — nunca inventa', async () => {
    const { call } = fresh();
    for (const [key, error] of [
      ['codigoCliente', /codigoCliente requerido/],
      ['direccionEntrega', /direccionEntrega requerido/],
      ['pais', /pais requerido/],
      ['lineas', /lineas requeridas/],
    ] as const) {
      const res = await call('proforma.crear', { ...BASE, [key]: undefined });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(error);
    }
    const sinKilos = await call('proforma.crear', { ...BASE, lineas: [{ codigoOben: 'SC15TN' }] });
    expect(sinKilos.error).toMatch(/línea 1 necesita codigoOben y kilos/);
  });

  it('sin cubicar → cubicada → (modifica: vuelve a sin cubicar) → aprobada/retenida → cartera → activa', async () => {
    const { call } = fresh();
    const created = await call<{ numberPF: string; estado: string }>('proforma.crear', BASE);
    expect(created.data).toMatchObject({ simulated: true, numberPF: 'SIM-95001', estado: 'sin_cubicar' });
    const pf = created.data!.numberPF;

    expect((await call('proforma.aprobar', { numberPF: pf })).error).toMatch(/solo se aprueba una Proforma cubicada/);

    await call('sim.cubicar', { numberPF: pf });
    let status = (await call<ObenPlusProformaStatus>('proforma.status', { numberPF: pf })).data!;
    expect(status).toMatchObject({ estado: 'cubicada', pais: 'ECUADOR', exportacion: true, cliente: 'CLIENTE SIMULADO A' });
    const cub = (await call<ObenPlusCubicaje>('proforma.cubicaje', { numberPF: pf })).data!;
    expect(cub.contenedoresPlaneados).toBe(1);
    expect(cub.pesoPlaneadoKg).toBe(1050 + 500); // ajustado al estándar de empaque simulado (múltiplos de 50 kg)

    // El cliente pide modificar: vuelve a "sin cubicar" (Planeación cubica de nuevo).
    await call('proforma.modificar', { numberPF: pf, lineas: [{ codigoOben: 'SC15TN', kilos: 2000 }] });
    expect((await call<ObenPlusProformaStatus>('proforma.status', { numberPF: pf })).data!.estado).toBe('sin_cubicar');
    await call('sim.cubicar', { numberPF: pf });

    const aprobada = await call<{ numberOrderSales: number; estado: string }>('proforma.aprobar', { numberPF: pf });
    expect(aprobada.data).toMatchObject({ estado: 'retenida', numberOrderSales: 9_000_001 });
    expect((await call('proforma.modificar', { numberPF: pf, lineas: LINEAS })).error).toMatch(/ya no se puede modificar/);

    const retenida = (await call<ObenPlusOvCartera>('ov.cartera', { numberOrderSales: 9_000_001 })).data!;
    expect(retenida).toMatchObject({ numberPF: pf, liberada: false, pnd: false });
    expect((await call('ov.activar', { numberPF: pf })).error).toMatch(/cartera no ha liberado/);

    await call('sim.liberarCartera', { numberPF: pf });
    const activa = await call<{ estado: string }>('ov.activar', { numberPF: pf });
    expect(activa.data!.estado).toBe('activa');
    status = (await call<ObenPlusProformaStatus>('proforma.status', { numberPF: pf })).data!;
    expect(status.fechas.entregaComprometida).not.toBeNull();
    expect((await call<ObenPlusOvCartera>('ov.cartera', { numberOrderSales: 9_000_001 })).data).toMatchObject({ liberada: true, pnd: false });

    const cambio = await call<{ anterior: string; entregaComprometida: string }>('sim.cambiarEntrega', { numberPF: pf, fecha: '2026-10-29' });
    expect(cambio.data).toMatchObject({ anterior: status.fechas.entregaComprometida, entregaComprometida: '2026-10-29' });
    expect((await call('proforma.anular', { numberPF: pf })).error).toMatch(/activa no se anula/);
  });

  it('una orden activa sin cartera liberada es PND (Producir No Despachar)', async () => {
    const { call } = fresh();
    const pf = (await call<{ numberPF: string }>('proforma.crear', BASE)).data!.numberPF;
    await call('sim.cubicar', { numberPF: pf });
    const { numberOrderSales } = (await call<{ numberOrderSales: number }>('proforma.aprobar', { numberPF: pf })).data!;
    expect((await call<ObenPlusCartera>('proforma.cartera', { numberPF: pf })).data).toMatchObject({ liberada: false, pnd: false });

    // Comodín "producir no despachar": OBEN MAS la activa sin que cartera libere.
    await call('sim.producirNoDespachar', { numberPF: pf });
    const c = (await call<ObenPlusOvCartera>('ov.cartera', { numberOrderSales })).data!;
    expect(c).toMatchObject({ numberPF: pf, liberada: false, pnd: true });
    expect(c.observacion).toMatch(/Producir No Despachar/);

    await call('sim.liberarCartera', { numberPF: pf });
    expect((await call<ObenPlusOvCartera>('ov.cartera', { numberOrderSales })).data).toMatchObject({ liberada: true, pnd: false });
  });

  it('anular deja la Proforma fuera de los listados y bloquea toda escritura posterior', async () => {
    const { call } = fresh();
    const pf = (await call<{ numberPF: string }>('proforma.crear', BASE)).data!.numberPF;
    await call('proforma.anular', { numberPF: pf, motivo: 'El cliente no continúa' });
    const list = (await call<ObenPlusProformaList>('proforma.list', {})).data!.proformas;
    expect(list.some((p) => p.numberPF === pf)).toBe(false);
    expect((await call('sim.cubicar', { numberPF: pf })).error).toMatch(/está anulada/);
  });

  it('las Proformas simuladas son por tenant y solo se escriben las creadas en el simulador', async () => {
    const { call } = fresh();
    const pf = (await call<{ numberPF: string }>('proforma.crear', BASE)).data!.numberPF;
    expect((await call('sim.cubicar', { numberPF: pf }, 't2')).error).toMatch(/no existe en el simulador/);
    expect((await call('proforma.aprobar', { numberPF: '11271' })).error).toMatch(/no existe en el simulador/);
  });

  it('cliente.consultar devuelve un maestro determinista, con direcciones rotuladas como SIMULADAS', async () => {
    const { call } = fresh();
    const a = (await call<ObenPlusCliente>('cliente.consultar', { codigoCliente: 'C-77' })).data!;
    const b = (await call<ObenPlusCliente>('cliente.consultar', { codigoCliente: 'C-77' })).data!;
    expect(a).toEqual(b);
    expect(a.direcciones.length).toBeGreaterThan(0);
    for (const d of a.direcciones) expect(d.direccion).toMatch(/SIMULADA/);
    expect(a.exportacion).toBe(a.pais !== 'COLOMBIA');
    expect((await call('cliente.consultar', {})).error).toMatch(/codigoCliente requerido/);
  });
});
