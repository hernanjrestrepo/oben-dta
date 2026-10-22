import { BadRequestException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { StaticScenarioProvider } from '../integrations/hub/static-scenario-provider';
import { ObenPlusMockAdapter } from '../integrations/hub/adapters/oben-plus.mock';
import { InMemoryObenPlusSimStore } from '../integrations/hub/oben-plus-sim.store';
import type { ComercialCase } from '../../entities/comercial-case.entity';
import { ComercialFlujoService } from './comercial-flujo.service';
import { ComercialIntakeService } from './comercial-intake.service';
import { ProformasObenService } from './proformas-oben.service';

/**
 * Demo comercial con la Proforma REAL en OBEN MAS (APIs comerciales en el servidor de pruebas de Oben, 22-oct):
 * cliente con código de Oben (9995), destino del maestro real (1828 = ALADDIN PACKAGING LLC.), equivalencias a
 * películas de Oben. Cubicaje, PDF y cartera siguen en el simulador sobre el mismo número de Proforma.
 */
const CTX = { tenantId: 't1', userId: 'u1' };

class Mem<T extends { id?: string }> {
  rows: T[] = [];
  create(x: Partial<T>) {
    return { ...x } as T;
  }
  async save(x: T) {
    if (!x.id) (x as { id?: string }).id = `id-${this.rows.length + 1}`;
    const i = this.rows.findIndex((r) => r.id === x.id);
    const copy = structuredClone(x);
    if (copy && (copy as unknown as { nextCheckAt?: unknown }).nextCheckAt && !((copy as unknown as { nextCheckAt: unknown }).nextCheckAt instanceof Date)) {
      (copy as unknown as { nextCheckAt: Date }).nextCheckAt = new Date((copy as unknown as { nextCheckAt: string }).nextCheckAt);
    }
    if (i >= 0) this.rows[i] = copy;
    else this.rows.push(copy);
    return x;
  }
  private match(r: T, where: Record<string, unknown>) {
    return Object.entries(where).every(([k, v]) => {
      const val = (r as unknown as Record<string, unknown>)[k];
      if (v instanceof FindOperator) return v.type === 'in' ? (v.value as unknown[]).includes(val) : v.type === 'isNull' ? val === null || val === undefined : true;
      return val === v;
    });
  }
  async findOne({ where }: { where: Record<string, unknown> }) {
    const r = this.rows.find((x) => this.match(x, where));
    return r ? structuredClone(r) : null;
  }
  async find({ where }: { where: Record<string, unknown> }) {
    return this.rows.filter((x) => this.match(x, where)).map((r) => structuredClone(r));
  }
  createQueryBuilder() {
    const qb = { addSelect: () => qb, where: () => qb, getOne: async () => null };
    return qb;
  }
}

const MAESTRO_CLIENTES = [
  { CodSec_Entity: 9995, Nombre_Cliente: 'OBEN US, LLC', Pais_Cliente: 'USA', CodSed_CustomerAddress: 1823, Target_Customer: 'ALADDIN PACKAGING LLC', Direccion_Destino: '115 ENGINEERS ROAD\r\nHAUPPAUGE NY 11788\r\nUSA' },
  { CodSec_Entity: 9995, Nombre_Cliente: 'OBEN US, LLC', Pais_Cliente: 'USA', CodSed_CustomerAddress: 1828, Target_Customer: 'ALADDIN PACKAGING LLC.', Direccion_Destino: '40 GOVERNOR DR.\r\nNEWBURGH, NY 12550\r\nUSA' },
];
const PRODUCTOS = [
  { CodSec_Prod: 1024, CodSec_LineFilm: 1, Linea: 'BOPP', Pelicula: 'SC---0015TN', Referencia: 'SC---0015TN1000S0760', Ancho: 1000 },
  { CodSec_Prod: 5622, CodSec_LineFilm: 3, Linea: 'BOPET', Pelicula: 'ET---0012RT', Referencia: 'ET---0012RT0600S0760', Ancho: 600 },
  { CodSec_Prod: 261, CodSec_LineFilm: 1, Linea: 'BOPP', Pelicula: 'SC---0020TN', Referencia: 'SC---0020TN0610S0760', Ancho: 610 },
];
const PARTIDAS = [
  { CodSec_TariffDeparture: 1, Valor: '3920620090', Descripcion: 'P.A. Bopet Exportacion - Nacional', CodSec_Line: 3, Linea: 'BOPET' },
  { CodSec_TariffDeparture: 4, Valor: '3920.20.90.00', Descripcion: 'P.A. Bopp Exportacion', CodSec_Line: 1, Linea: 'BOPP' },
];
const PAR = {
  CodSec_CommercialCondition: 25, CodSec_Currency: 1, CodSec_EtiquetaBobina: 5, CodSec_EtiquetaPallet: 1, CodSec_Incoterms: 7, CodSec_CityPort: 1186,
  CodSec_City: 1186, Pais: 'USA', Desde: 'CARTAGENA - COLOMBIA', Hasta: 'NEWBURGH, NY 12550', Peso_Bruto_Maximo: 24493.97, Nota_Etiqueta: 'ALADDIN PACKAGING LLC',
  Nota_Operativa: 'MAXIMO 1 EMPALME', Nota_Especial: 'N/A', Consignado: '', Notificado: '',
};
const OC = {
  from: 'ceo@paradixe.xyz',
  subject: 'Orden de compra OC-PARADIXE-0002',
  messageId: '<oc-2@paradixe.xyz>',
  body: [
    'Orden de compra OC-PARADIXE-0002',
    'Fecha requerida: 2026-11-30',
    'Direccion de entrega: ALADDIN PACKAGING LLC. — 40 GOVERNOR DR., NEWBURGH, NY 12550, USA',
    '- BOPP 15, 1.000 kg, ancho 1000 mm, precio USD 2,85',
    '- Poliester 12, 2.000 lb, ancho 600 mm, precio USD 3,10',
    '- BOPP 20, 500 kg, ancho 24", precio USD 2,95',
  ].join('\n'),
};

function world(opts: { rechazarEncabezado?: string; leadTime?: boolean } = {}) {
  const store = new InMemoryObenPlusSimStore();
  const obenPlus = new ObenPlusMockAdapter(new StaticScenarioProvider(), store);
  const emails: Array<Record<string, unknown>> = [];
  const escrituras: Array<{ paso: string; valores: Record<string, unknown> }> = [];
  let rechazo = opts.rechazarEncabezado ?? null;
  let lead = !!opts.leadTime;
  let seq = 0;
  const hub = {
    call: jest.fn(async (system: string, op: string, args: Record<string, unknown>) => {
      if (system === 'email') {
        emails.push(args);
        return { ok: true, mode: 'mock', data: { id: `<m${++seq}@oben>` } };
      }
      if (system === 'obenCostOrder' && op === 'comercial.escribir') {
        const paso = String(args.paso);
        escrituras.push({ paso, valores: args.valores as Record<string, unknown> });
        if (paso === 'encabezado' && rechazo) return { ok: false, mode: 'real', error: `BUSINESS_ERROR: ${rechazo}` };
        if (paso === 'activar' && lead) return { ok: false, mode: 'real', error: 'BUSINESS_ERROR: No existe Lead Time Production para la pelicula SC---0015TN, el area de planeación debe incluirlo.' };
        return { ok: true, mode: 'real', data: paso === 'encabezado' ? { ok: true, codigoInterno: 13400, numeroPF: '11547' } : { ok: true } };
      }
      if (system === 'obenCostOrder' && op === 'query.run') {
        return { ok: true, mode: 'real', data: [{ NroProforma: '11547', Mercado: 'EXPORTACION', Cliente: 'OBEN US, LLC', OrdenesVenta: [{ NroOrdenVenta: '11400' }] }] };
      }
      return obenPlus.execute(op, args, CTX);
    }),
    capabilities: jest.fn(async (system: string) => ({ mode: system === 'obenPlus' ? 'mock' : system === 'email' ? 'mock' : 'real' })),
  };
  const cliente = { id: 'cli-p', clientId: 'PDX', name: 'PARADIXE — CLIENTE DEMO', email: 'ceo@paradixe.xyz', authorizedDomains: ['paradixe.xyz'], obenCode: '9995', comercialEmail: 'ceo@paradixe.xyz', isActive: true, finalCustomerInSubject: false };
  const clients = {
    findByEmailDomain: jest.fn(async (d: string) => ({ client: d === 'paradixe.xyz' ? cliente : null, ambiguous: false })),
    findOne: jest.fn(async () => cliente),
  };
  const eqDb = [
    { id: 'e1', clientId: 'cli-p', clientCode: 'BOPP 15', obenCode: 'SC---0015TN' },
    { id: 'e2', clientId: 'cli-p', clientCode: 'POLIESTER 12', obenCode: 'ET---0012RT' },
    { id: 'e3', clientId: 'cli-p', clientCode: 'BOPP 20', obenCode: 'SC---0020TN' },
  ];
  const equivalences = { findAll: jest.fn(async () => eqDb), create: jest.fn() };
  const maestros = {
    maestro: jest.fn(async (nombre: string, o: { buscar?: string } = {}) => {
      const base = nombre === 'clientes' ? MAESTRO_CLIENTES : nombre === 'productos' ? PRODUCTOS : PARTIDAS;
      const q = String(o.buscar ?? '').toUpperCase();
      const items = q ? (base as Array<Record<string, unknown>>).filter((f) => Object.values(f).some((v) => String(v).toUpperCase().includes(q))) : base;
      return { items, total: items.length, simulado: false };
    }),
    parametrizacion: jest.fn(async () => ({ datos: PAR, simulado: false })),
    validarEmpaque: jest.fn(async () => ({ valido: true, mensaje: 'La referencia tiene Maestro de Empaque para ese destino.', simulado: false })),
  };
  const audit = { log: jest.fn(async () => undefined), listForEntity: jest.fn(async () => []) };
  const tenant = { id: 't1', settings: { comercial: { habilitado: true, modo: 'supervisado' } }, integrationConfig: { obenCostOrder: {} } };
  const tenants = { findOne: jest.fn(async () => tenant), save: jest.fn(async (t: unknown) => t) };
  const casos = new Mem<ComercialCase>();
  const proformasRepo = new Mem<Record<string, unknown> & { id?: string }>();
  const idem = new Map<string, { status: string; result?: unknown }>();
  const idempotency = {
    claim: async (_t: string, _e: string, key: string) => {
      const ex = idem.get(key);
      if (ex) return { claimed: false, existingStatus: ex.status, existingResult: ex.result };
      idem.set(key, { status: 'processing' });
      return { claimed: true };
    },
    saveProgress: async (_t: string, key: string, r: unknown) => void (idem.get(key)!.result = r),
    markCompleted: async (_t: string, key: string, r: unknown) => void idem.set(key, { status: 'completed', result: r }),
    markFailed: async (_t: string, key: string) => void (idem.get(key)!.status = 'failed'),
    reclaimFailed: async (_t: string, key: string) => (idem.get(key)?.status === 'failed' ? (idem.get(key)!.status = 'processing', true) : false),
  };
  const distributionLists = { resolveRecipients: jest.fn(async () => ({ to: [], cc: [], bcc: [] })) };
  const proformas = new ProformasObenService(hub as never, CTX as never, audit as never, maestros as never, proformasRepo as never, tenants as never);
  const intake = new ComercialIntakeService(hub as never, clients as never, equivalences as never, maestros as never);
  const flujo = new ComercialFlujoService(
    casos as never,
    tenants as never,
    intake,
    hub as never,
    CTX as never,
    audit as never,
    distributionLists as never,
    idempotency as never,
    clients as never,
    equivalences as never,
    proformas,
  );
  const sim = (op: string, numberPF: string) => obenPlus.execute(op, { numberPF }, CTX);
  const tick = async (id: string) => flujo.procesar(await flujo.obtener(id));
  return {
    flujo,
    emails,
    escrituras,
    sim,
    tick,
    proformasRepo,
    store,
    setRechazo: (r: string | null) => (rechazo = r),
    setLead: (v: boolean) => (lead = v),
  };
}

describe('Demo comercial con la Proforma REAL en OBEN MAS (servidor de pruebas)', () => {
  it('OC por correo → Proforma real → cubicaje (simulado) → al cliente → aprueba (OV real) → cartera (simulada) → OV activa (real)', async () => {
    const w = world();
    let caso = await w.flujo.recibirOc(OC, 'correo');
    // Lectura: destino REAL del maestro de Oben, líneas a películas de Oben, libras y pulgadas convertidas.
    expect(caso).toMatchObject({ estado: 'oc_recibida', codigoClienteOben: '9995', tipo: 'exportacion', pais: 'USA', simulated: false, missing: [] });
    expect(caso.destino).toMatchObject({ direccionId: '1828', fuente: 'orden_compra' });
    expect(caso.lineas.map((l) => [l.codigoOben, l.kilos, l.anchoMm, l.precioUnitario])).toEqual([
      ['SC---0015TN', 1000, 1000, 2.85],
      ['ET---0012RT', 907.185, 600, 3.1],
      ['SC---0020TN', 500, 609.6, 2.95],
    ]);
    expect(caso.accionPendiente).toMatchObject({ tipo: 'crear_proforma' });
    expect(w.escrituras).toHaveLength(0); // freno de mano: nada se escribe sin confirmar

    // Paso 4: confirmar → Proforma real en OBEN MAS (número oficial 11547) y registrada en el simulador.
    caso = await w.flujo.confirmar(caso.id);
    expect(caso).toMatchObject({ estado: 'sin_cubicar', numberPF: '11547', accionPendiente: null });
    expect(w.escrituras.map((e) => e.paso)).toEqual(['encabezado', 'detalle', 'detalle', 'detalle']);
    expect(w.escrituras.slice(1).map((e) => e.valores.CodSecProduct)).toEqual([1024, 5622, 261]); // 609,6 mm → referencia de 610 mm
    expect(w.escrituras[0].valores).toMatchObject({ CodSecEntity: 9995, CodSedCustomerAddress: 1828, PurchaseOrder: 'OC-PARADIXE-0002', DestinationPort: 1186, Export: 'true' });
    expect(caso.eventos.at(-1)!.detalle).toMatch(/Proforma 11547 creada en OBEN MAS \(servidor de PRUEBAS de Oben, código interno 13400\)/);
    expect(await w.store.get('t1', '11547')).toMatchObject({ estado: 'sin_cubicar' });

    // Paso 5: Planeación cubica (simulado) → la Proforma sale sola al cliente.
    await w.sim('sim.cubicar', '11547');
    caso = await w.tick(caso.id);
    expect(caso.estado).toBe('enviada_cliente');
    expect(w.emails.at(-1)).toMatchObject({ to: 'ceo@paradixe.xyz', subject: expect.stringMatching(/Proforma 11547 .*\[PF 11547\]/) });

    // Paso 6: el cliente aprueba → confirmar → OV REAL (11400, leída del reporte de Oben), retenida.
    caso = await w.flujo.registrarRespuesta(caso, { tipo: 'aprueba', motivo: 'Aprobada por teléfono', via: 'manual' });
    caso = await w.flujo.confirmar(caso.id);
    expect(caso).toMatchObject({ estado: 'retenida', numberOrderSales: 11400 });
    expect(w.escrituras.at(-1)!.paso).toBe('ov');

    // Paso 7: cartera libera (simulado) → confirmar → OV ACTIVA en OBEN MAS.
    await w.sim('sim.liberarCartera', '11547');
    caso = await w.tick(caso.id);
    expect(caso.accionPendiente).toMatchObject({ tipo: 'activar' });
    caso = await w.flujo.confirmar(caso.id);
    expect(caso.estado).toBe('activa');
    expect(w.escrituras.at(-1)!.paso).toBe('activar');
    const real = w.proformasRepo.rows[0];
    expect(real).toMatchObject({ estado: 'activa', numeroPF: '11547', codigoInterno: 13400, ordenVenta: 11400, casoId: caso.id });
  });

  it('si Oben rechaza el encabezado, el caso NO avanza, explica el motivo y al confirmar de nuevo continúa sin duplicar', async () => {
    const w = world({ rechazarEncabezado: 'No se pudo inserta los datos de la orden de venta con los parámetros suministrados' });
    let caso = await w.flujo.recibirOc(OC, 'correo');
    await expect(w.flujo.confirmar(caso.id)).rejects.toThrow(/Oben rechazó el encabezado de la proforma sin decir qué dato falla/);
    caso = await w.flujo.obtener(caso.id);
    expect(caso).toMatchObject({ estado: 'oc_recibida', numberPF: null });
    expect(caso.accionPendiente).toMatchObject({ tipo: 'crear_proforma' }); // la acción sigue pendiente
    w.setRechazo(null);
    caso = await w.flujo.confirmar(caso.id);
    expect(caso).toMatchObject({ estado: 'sin_cubicar', numberPF: '11547' });
    expect(w.escrituras.filter((e) => e.paso === 'encabezado')).toHaveLength(2);
    expect(w.proformasRepo.rows).toHaveLength(1);
  });

  it('activación rechazada por Lead Time: queda retenida con la explicación; cuando Planeación lo carga, se activa', async () => {
    const w = world({ leadTime: true });
    let caso = await w.flujo.recibirOc(OC, 'correo');
    caso = await w.flujo.confirmar(caso.id);
    await w.sim('sim.cubicar', '11547');
    caso = await w.tick(caso.id);
    caso = await w.flujo.registrarRespuesta(caso, { tipo: 'aprueba', motivo: 'ok', via: 'manual' });
    caso = await w.flujo.confirmar(caso.id);
    await w.sim('sim.liberarCartera', '11547');
    caso = await w.tick(caso.id);
    await expect(w.flujo.confirmar(caso.id)).rejects.toThrow(/Planeación no tiene cargado el tiempo de producción \(Lead Time\) de la película SC---0015TN/);
    expect((await w.flujo.obtener(caso.id)).estado).toBe('retenida');
    w.setLead(false);
    expect((await w.flujo.confirmar(caso.id)).estado).toBe('activa');
  });

  it('una línea sin precio no deja crear la Proforma real (OBEN MAS lo exige): queda como faltante', async () => {
    const w = world();
    const caso = await w.flujo.recibirOc({ ...OC, messageId: '<oc-3@paradixe.xyz>', body: OC.body.replace(', precio USD 2,95', '') }, 'correo');
    expect(caso.missing.join(' ')).toMatch(/Línea 3 .*precio por kilo \(OBEN MAS lo pide para crear la Proforma\)/);
    expect(caso.accionPendiente).toBeNull();
  });

  it('un cliente con datos SIM- sigue por el simulador (no se llama a las APIs de Oben)', async () => {
    const w = world();
    const caso = await w.flujo.recibirOc(OC, 'correo');
    caso.codigoClienteOben = 'SIM-CLI-01';
    expect(w.flujo.entradaReal(caso)).toBeNull();
  });
});

void BadRequestException;
