import { BadRequestException, ConflictException } from '@nestjs/common';
import { LiquidacionService } from './liquidacion.service';
import {
  IncotermFormulaCalculator,
  SimulatedIncotermCalculator,
  type LiquidacionValueCalculator,
} from './liquidacion-value-calculator';
import type { LiquidacionInput } from './liquidacion.types';

/**
 * SIMULACIÓN COMPLETA del proceso de liquidación — sin tocar Oben real.
 *
 * Los fixtures de spCheckSettlement son las respuestas REALES obtenidas en
 * vivo el 2026-09-23 (PF 10867, 11357 y 11271). Lo que NO es real y está
 * simulado: la respuesta de spSettlement_Head/Detail (nunca se han llamado en
 * vivo — no hay sandbox). La fórmula de José se prueba a fondo en
 * liquidacion-value-calculator.spec.ts; aquí casi todo usa un calculador de
 * prueba para ejercitar los envíos. Esta suite valida el ORDEN, la
 * idempotencia, los candados y el manejo de fallos — no los nombres de campo
 * de las respuestas de escritura de Oben.
 */

const CHECK: Record<string, unknown> = {
  // PF 10867 tal como responde HOY el servidor .12 (verificado en vivo el 2026-10-07): ya trae Parida, TipoMaterial y Linea.
  '99010': { Proforma: '99010', OrdenVenta: '10758', OrdenCompra: '-', Cliente: 'ERPLASTI INDUSTRIA E COMERCIO DE PLASTICOS LTDA', Detalle: [{ CodSed_LineFilm: 6, TipoPelicula: 'SC---0020TN', Precio: 2.55, KilosTotales: 22080.76, Parida: '39.20.10.90', TipoMaterial: 'CRISTAL', Linea: 'BOPP' }] },
  '10867': { Proforma: '10867', OrdenVenta: '10758', OrdenCompra: '-', Cliente: 'ERPLASTI INDUSTRIA E COMERCIO DE PLASTICOS LTDA', Detalle: [{ CodSed_LineFilm: 6, TipoPelicula: 'SC---0020TN', Precio: 2.55, KilosTotales: 22080.76 }] },
  '11357': { Proforma: '11357', OrdenVenta: '11147', OrdenCompra: '3398', Cliente: 'OBEN DISTRIBUIDORA COLOMBIA LTDA', Detalle: [{ CodSed_LineFilm: 13, TipoPelicula: 'SC---0015TN', Precio: 2.85, KilosTotales: 5661.2 }] },
  '11271': { Proforma: '11271', OrdenVenta: '11086', OrdenCompra: '128353', Cliente: 'OBEN US, LLC', Detalle: [{ CodSed_LineFilm: 113, TipoPelicula: 'ENA--0012TM', Precio: 2.827, KilosTotales: 1339.42 }] },
  // Sintética (2 líneas) — el ejemplo de PF con varias líneas aún no se ha visto en vivo.
  '99001': { Proforma: '99001', OrdenVenta: '11086', OrdenCompra: '1', Cliente: 'OBEN US, LLC', Detalle: [{ CodSed_LineFilm: 1, TipoPelicula: 'A', Precio: 2, KilosTotales: 100 }, { CodSed_LineFilm: 2, TipoPelicula: 'B', Precio: 3, KilosTotales: 200 }] },
};
const PAIS_BY_OV: Record<string, string> = { '10758': 'COLOMBIA', '11147': 'COLOMBIA', '11086': 'USA' };

class ObenSim {
  calls: Array<{ op: string; args: Record<string, unknown>; options: unknown }> = [];
  heads: Array<Record<string, unknown>> = [];
  details: Array<Record<string, unknown>> = [];
  private nextHeadId = 5000;
  private failures: Array<{ op: string; nth: number; error: string; seen: number }> = [];
  headResponse: (id: number) => unknown = (id) => ({ CodSec_InvoiceDataComexHead: id });

  failOn(op: string, nth: number, error: string) {
    this.failures.push({ op, nth, error, seen: 0 });
  }
  writes() {
    return this.calls.filter((c) => c.op.startsWith('liquidacion.crear'));
  }

  async call(_system: string, op: string, args: Record<string, unknown>, options?: unknown) {
    this.calls.push({ op, args, options });
    const f = this.failures.find((x) => x.op === op);
    if (f && ++f.seen === f.nth) return { ok: false, error: f.error };
    if (op === 'liquidacion.consultar') {
      const d = CHECK[String(args.numberPF)];
      return d ? { ok: true, data: d } : { ok: true, data: {} };
    }
    if (op === 'query.run') return { ok: true, data: { Pais: PAIS_BY_OV[String(args.numberOrderSales)] ?? '' } };
    if (op === 'liquidacion.crearEncabezado') {
      const id = this.nextHeadId++;
      this.heads.push({ ...args, id });
      return { ok: true, data: this.headResponse(id) };
    }
    if (op === 'liquidacion.crearDetalle') {
      this.details.push({ ...args });
      return { ok: true, data: { ok: true } };
    }
    return { ok: false, error: `op inesperada ${op}` };
  }
}

/** Misma semántica que IdempotencyService real (claim atómico, estados, resultado, reanudación atómica). */
type Row = { status: 'processing' | 'completed' | 'failed'; result?: unknown; error?: string; updatedAt: number };
class FakeIdempotency {
  rows = new Map<string, Row>();
  async claim(_t: string, _e: string, key: string) {
    const ex = this.rows.get(key);
    if (ex) return { claimed: false, existingStatus: ex.status, existingResult: ex.result };
    this.rows.set(key, { status: 'processing', updatedAt: Date.now() });
    return { claimed: true };
  }
  async saveProgress(_t: string, key: string, result: unknown) {
    this.touch(key, { result: JSON.parse(JSON.stringify(result)) });
  }
  async markCompleted(_t: string, key: string, result: unknown) {
    this.touch(key, { status: 'completed', result: JSON.parse(JSON.stringify(result)) });
  }
  async markFailed(_t: string, key: string, error: string) {
    this.touch(key, { status: 'failed', error });
  }
  async reclaimFailed(_t: string, key: string) {
    if (this.rows.get(key)?.status !== 'failed') return false;
    this.touch(key, { status: 'processing', error: undefined });
    return true;
  }
  async reclaimStale(_t: string, key: string, staleBefore: Date) {
    const row = this.rows.get(key);
    if (row?.status !== 'processing' || row.updatedAt >= staleBefore.getTime()) return false;
    this.touch(key, {});
    return true;
  }
  /** Simula una liquidación que quedó en 'processing' porque el proceso murió a mitad. */
  seedInterrupted(key: string, progress: unknown, minutesAgo: number) {
    this.rows.set(key, { status: 'processing', result: progress, updatedAt: Date.now() - minutesAgo * 60_000 });
  }
  private touch(key: string, patch: Partial<Row>) {
    Object.assign(this.rows.get(key)!, patch, { updatedAt: Date.now() });
  }
}

/**
 * SOLO PRUEBA — no es la fórmula real de José. Declara `simulated:false`
 * porque hace el papel del futuro calculador REAL (para ejercitar los envíos
 * con confirm:true); el candado de la fórmula simulada se prueba aparte.
 */
const testCalculator: LiquidacionValueCalculator = {
  simulated: false,
  compute: ({ line }) => {
    const r = (n: number) => Math.round(n * 100) / 100;
    const freight = r(line.kilosTotal * 0.1);
    const sure = r(line.valueTotal * 0.01);
    const other = 5;
    const subTotal = r(line.valueTotal + freight + sure + other);
    return {
      valueFOB: line.valueTotal,
      kilosTotalUnit: 1,
      valueFreight: freight,
      valueFreightUnit: r(freight / line.kilosTotal),
      valueSure: sure,
      valueSureUnit: r(sure / line.kilosTotal),
      expensesOther: other,
      expensesOtherUnit: r(other / line.kilosTotal),
      subTotal,
      total: subTotal,
      totalUnidad: r(subTotal / line.kilosTotal),
    };
  },
};

const HEADER_USER = { direccion: '1 Port Rd, Miami FL', puertoArribo: 'Miami', puertoEmbarque: 'Cartagena', paNcm: '3920.20', paNaladi: '3920.20.00', notes: 'prueba' };
const USA_CHARGES = { inlandFreight: 900, destinationCharges: 150 };

/** El aviso de "sin partida" (familia ENA sin tipo confirmado) es ajeno a lo que prueban los ajustes de tarifas. */
const deTarifas = (a: string) => !a.startsWith('Sin partida en la tabla') && !a.startsWith('Sin tipo de película') && !a.startsWith('Arancel de importación');

function build(opts: { calculator?: LiquidacionValueCalculator; provisionales?: boolean; requiereAprobacion?: boolean } = {}) {
  const sim = new ObenSim();
  const idem = new FakeIdempotency();
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const rates = {
    resolveSurcharges: jest.fn().mockResolvedValue({
      entryFee: 110,
      importerSecurityFiling: 20,
      harborMaintenanceFee: 4.73,
      harborMaintenanceFeeFormula: '0.125%',
      destinationCharges: null,
      missing: [],
    }),
    resolveInlandByAddress: jest.fn().mockResolvedValue({ inlandFreight: null, destinationPort: null, destinationAddress: null, validUntil: null, vencida: false }),
    resolveOceanFreight: jest.fn().mockResolvedValue({ flete: null, origen: null, destino: null, forwarder: null, naviera: null, validUntil: null, vencida: false }),
  };
  // Correo de cierre (OBEN MAS §1.2): se prueba a fondo en liquidacion-cierre.service.spec.ts;
  // aquí solo importa CUÁNDO se dispara.
  const cierre = {
    enviarTrasCompletar: jest.fn(async (numberPF: string) => ({ sent: true, numberPF, to: ['comex@oben.com'], cc: [], adjuntos: [], simulated: false })),
  };
  // Aprobaciones de COMEX en memoria (misma semántica que el repositorio: una por PF).
  const filasAprob: Array<Record<string, unknown>> = [];
  const aprobaciones = {
    findOne: jest.fn(async ({ where }: { where: { numberPF: string } }) => filasAprob.find((f) => f.numberPF === where.numberPF) ?? null),
    create: jest.fn((x: Record<string, unknown>) => ({ updatedAt: new Date(), ...x })),
    save: jest.fn(async (x: Record<string, unknown>) => {
      if (!filasAprob.includes(x)) filasAprob.push(x);
      return x;
    }),
  };
  const service = new LiquidacionService(
    sim as never,
    { tenantId: 't1', userId: 'u1' } as never,
    audit as never,
    idem as never,
    rates as never,
    opts.calculator ?? testCalculator,
    cierre as never,
    { valoresProvisionales: !!opts.provisionales, requiereAprobacion: !!opts.requiereAprobacion },
    aprobaciones as never,
  );
  return { service, sim, idem, audit, rates, cierre, aprobaciones };
}

/**
 * DAP con otros gastos = Destination Charges (900 + 110 + 20 + 4.73): no
 * dispara ajustes ni pendientes de USA. El calculador de prueba no usa estos valores.
 */
const TOTALES_USA = { incoterm: 'DAP', flete: 100, otrosGastos: 1034.73, valorPoliza: 1.00053 };
const usaInput = (extra: LiquidacionInput = {}): LiquidacionInput => ({ header: { ...HEADER_USER, ...USA_CHARGES }, totales: TOTALES_USA, ...extra });

describe('Liquidación — simulación completa (datos reales de spCheckSettlement, escrituras simuladas)', () => {
  describe('borrador con las respuestas REALES de Oben', () => {
    it('PF 11271 (USA): deriva kilos y valor total del SP, toma Entry Fee/ISF/Harbor del maestro, y lista lo que falta (nada se inventa)', async () => {
      const { service } = build({ calculator: { simulated: false, compute: () => ({}) } });
      const draft = await service.getDraft('11271');

      expect(draft.pais).toBe('USA');
      expect(draft.esUSA).toBe(true);
      expect(draft.cliente).toBe('OBEN US, LLC');
      expect(draft.lines).toHaveLength(1);
      expect(draft.lines[0]).toMatchObject({ codSecLineFilm: 113, kilosTotal: 1339.42, valueTotal: 3786.54 }); // 2.827 × 1339.42
      expect(draft.header).toMatchObject({ entryFee: 110, importerSecurityFiling: 20, harborMaintenanceFee: 4.73 });
      expect(draft.readyToSubmit).toBe(false);
      expect(draft.missing).toEqual(
        expect.arrayContaining([
          'Encabezado — Dirección',
          'Encabezado — Puerto de arribo',
          'Encabezado — Puerto de embarque',
          'Encabezado (destino USA) — Inland Freight',
          'Encabezado (destino USA) — Destination Charges (Inland + Entry + ISF + HMF)',
          'Incoterm de la PF (EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP)',
          'Línea 113 (ENA--0012TM) — Valor flete',
          'Línea 113 (ENA--0012TM) — Valor FOB',
          'Línea 113 (ENA--0012TM) — Total por unidad',
        ]),
      );
    });

    it('PF 11357 (Colombia, doméstica): NO exige los cargos de USA ni consulta el maestro de tarifas', async () => {
      const { service, rates } = build({ calculator: { simulated: false, compute: () => ({}) } });
      const draft = await service.getDraft('11357');

      expect(draft.esUSA).toBe(false);
      expect(draft.lines[0].valueTotal).toBe(16134.42); // 2.85 × 5661.20
      expect(rates.resolveSurcharges).not.toHaveBeenCalled();
      expect(draft.missing.some((m) => m.includes('USA'))).toBe(false);
    });

    it('la partida sale de la película (SC = BOPP: 3920.20.19 / NALADI 3920.20.10) y lo digitado manda', async () => {
      const { service } = build({ calculator: new IncotermFormulaCalculator() });
      const auto = await service.getDraft('10867');
      expect(auto.header).toMatchObject({ paNcm: '3920.20.19', paNaladi: '3920.20.10' });
      expect(auto.headerOrigen).toMatchObject({ paNcm: 'maestro', paNaladi: 'maestro' });
      expect(auto.ajustes).toContain('Partida arancelaria de la tabla de Oben: 3920.20.19 — PELICULA DE POLIPROPILENO BIORIENTADO.');
      const digitada = await service.getDraft('10867', { header: { paNcm: '3920.20.99' } });
      expect(digitada.header.paNcm).toBe('3920.20.99');
      expect(digitada.headerOrigen.paNcm).toBe('usuario');
    });

    it('respuesta actual de Oben (Parida + Linea BOPP + CRISTAL): Pa_Ncm = partida de Colombia y tipo BOPP para la factura', async () => {
      const { service } = build({ calculator: new IncotermFormulaCalculator() });
      const d = await service.getDraft('99010');
      expect(d.header.paNcm).toBe('39.20.10.90');
      expect(d.headerOrigen.paNcm).toBe('oben');
      expect(d.partidaTipo?.tipo).toBe('bopp');
      expect(d.header.paNaladi).toBe('3920.20.10');
    });

    it('familia sin tipo confirmado (ENA): no se adivina, queda la partida provisional y se avisa', async () => {
      const { service } = build({ calculator: new IncotermFormulaCalculator(), provisionales: true });
      const d = await service.getDraft('11271');
      expect(d.headerOrigen.paNcm).toBe('provisional');
      expect(d.ajustes.some((a) => a.startsWith('Sin tipo de película para: ENA--0012TM'))).toBe(true);
    });

    it('PF 10867 (la ya liquidada de referencia): valor total inicial = 2.55 × 22080.76', async () => {
      const { service } = build();
      const draft = await service.getDraft('10867');
      expect(draft.lines[0].valueTotal).toBe(56305.94);
    });

    it('respuesta vacía o sin Detalle → error claro, no un borrador inventado', async () => {
      const { service } = build();
      await expect(service.getDraft('123456')).rejects.toThrow(BadRequestException);
    });

    it('un numberPF inválido se rechaza antes de llamar a Oben', async () => {
      const { service, sim } = build();
      await expect(service.getDraft('abc')).rejects.toThrow(BadRequestException);
      expect(sim.calls).toHaveLength(0);
    });
  });

  describe('envío', () => {
    it('sin datos completos NO escribe nada en Oben y devuelve la lista de faltantes', async () => {
      const { service, sim } = build({ calculator: { simulated: false, compute: () => ({}) } });
      await expect(service.submit('11271', {}, { confirm: true })).rejects.toThrow(BadRequestException);
      expect(sim.writes()).toHaveLength(0);
    });

    it('SIN confirm:true es solo simulación: devuelve los payloads y no llama a ninguna API de escritura', async () => {
      const { service, sim, idem } = build();
      const res = await service.submit('11271', usaInput());

      expect(res.dryRun).toBe(true);
      expect(res.payloads?.header).toMatchObject({ numberPF: '11271', direccion: '1 Port Rd, Miami FL', entryFee: 110 });
      expect(res.payloads?.details).toHaveLength(1);
      expect(sim.writes()).toHaveLength(0);
      expect(idem.rows.size).toBe(0);
    });

    it('camino feliz USA: encabezado primero, luego el detalle con el id del encabezado; auditoría completa', async () => {
      const { service, sim, audit } = build();
      const res = await service.submit('11271', usaInput(), { confirm: true });

      expect(res).toMatchObject({ dryRun: false, headId: 5000, detailsCreated: 1 });
      expect(sim.writes().map((c) => c.op)).toEqual(['liquidacion.crearEncabezado', 'liquidacion.crearDetalle']);
      expect(sim.details[0]).toMatchObject({ codSecInvoiceDataComexHead: 5000, codSecLineFilm: 113, valueFOB: 3786.54 });
      // CodSecPoliza se omite a propósito (José).
      expect(sim.details[0]).not.toHaveProperty('codSecPoliza');
      expect(audit.log.mock.calls.map((c) => c[0].action)).toEqual([
        'liquidacion_iniciada',
        'liquidacion_encabezado_creado',
        'liquidacion_completada',
      ]);
    });

    it('las ESCRITURAS nunca se reintentan solas (maxAttempts:1) — un reintento tras timeout duplicaría un registro real', async () => {
      const { service, sim } = build();
      await service.submit('11271', usaInput(), { confirm: true });
      for (const w of sim.writes()) {
        expect(w.options).toMatchObject({ maxAttempts: 1 });
      }
    });

    it('PF con 2 líneas: un encabezado y un detalle por línea, todos con el mismo id de encabezado', async () => {
      const { service, sim } = build();
      const res = await service.submit('99001', usaInput(), { confirm: true });

      expect(res.detailsCreated).toBe(2);
      expect(sim.heads).toHaveLength(1);
      expect(sim.details.map((d) => [d.codSecLineFilm, d.codSecInvoiceDataComexHead])).toEqual([
        [1, 5000],
        [2, 5000],
      ]);
    });

    it('idempotencia: liquidar la MISMA PF otra vez no escribe nada más', async () => {
      const { service, sim } = build();
      await service.submit('11271', usaInput(), { confirm: true });
      const before = sim.writes().length;

      const again = await service.submit('11271', usaInput(), { confirm: true });

      expect(again).toMatchObject({ alreadyDone: true, headId: 5000 });
      expect(sim.writes()).toHaveLength(before);
    });

    it('concurrencia: dos envíos simultáneos de la misma PF → solo uno escribe, el otro recibe Conflict', async () => {
      const { service, sim } = build();
      const [a, b] = await Promise.allSettled([
        service.submit('11271', usaInput(), { confirm: true }),
        service.submit('11271', usaInput(), { confirm: true }),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual(['fulfilled', 'rejected']);
      const rejected = [a, b].find((x) => x.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ConflictException);
      expect(sim.heads).toHaveLength(1);
      expect(sim.details).toHaveLength(1);
    });
  });

  describe('fallos a medias (Oben no permite borrar lo ya creado)', () => {
    it('falla definitiva en el detalle 2: no se pierde el avance, no se recrea el encabezado y solo se completa lo faltante con resume', async () => {
      const { service, sim, idem } = build();
      sim.failOn('liquidacion.crearDetalle', 2, 'HTTP 500: Error en el SP');

      await expect(service.submit('99001', usaInput(), { confirm: true })).rejects.toThrow(BadRequestException);
      expect(idem.rows.get('liquidacion:99001')).toMatchObject({ status: 'failed' });
      expect(sim.heads).toHaveLength(1);
      expect(sim.details).toHaveLength(1);

      // Sin resume explícito: se bloquea (hay que verificar en Oben primero).
      await expect(service.submit('99001', usaInput(), { confirm: true })).rejects.toThrow(ConflictException);

      const res = await service.submit('99001', usaInput(), { confirm: true, resume: true });
      expect(res).toMatchObject({ headId: 5000, detailsCreated: 2 });
      expect(sim.heads).toHaveLength(1); // NO se creó un segundo encabezado
      expect(sim.details.map((d) => d.codSecLineFilm)).toEqual([1, 2]); // la línea 1 NO se duplicó
    });

    it('timeout (ambiguo) en el detalle: resume exige acknowledgeAmbiguous — el registro pudo haberse creado', async () => {
      const { service, sim } = build();
      sim.failOn('liquidacion.crearDetalle', 1, 'timeout: sin respuesta de "obenCostOrder.liquidacion.crearDetalle" tras 60000ms');

      await expect(service.submit('11271', usaInput(), { confirm: true })).rejects.toThrow(BadRequestException);
      await expect(service.submit('11271', usaInput(), { confirm: true, resume: true })).rejects.toThrow(/ambiguo/);
      expect(sim.details).toHaveLength(0);

      const res = await service.submit('11271', usaInput(), { confirm: true, resume: true, acknowledgeAmbiguous: true });
      expect(res.detailsCreated).toBe(1);
      expect(sim.heads).toHaveLength(1);
    });

    it('si crearEncabezado responde OK pero no se puede leer su id: NO se crean detalles a ciegas; se reanuda pasando headId a mano', async () => {
      const { service, sim } = build();
      sim.headResponse = () => ({ mensaje: 'OK' }); // forma desconocida
      await expect(service.submit('11271', usaInput(), { confirm: true })).rejects.toThrow(/CodSec_InvoiceDataComexHead/);
      expect(sim.details).toHaveLength(0);
      expect(sim.heads).toHaveLength(1);

      const res = await service.submit('11271', usaInput(), {
        confirm: true,
        resume: true,
        acknowledgeAmbiguous: true,
        headId: 5000,
      });
      expect(res).toMatchObject({ headId: 5000, detailsCreated: 1 });
      expect(sim.heads).toHaveLength(1); // no se creó otro encabezado
    });

    it('acepta el id del encabezado como número plano, como string, o como campo CodSec_InvoiceDataComexHead', async () => {
      for (const shape of [(id: number) => id, (id: number) => String(id), (id: number) => [{ CodSec_InvoiceDataComexHead: id }]]) {
        const { service, sim } = build();
        sim.headResponse = shape as never;
        const res = await service.submit('11271', usaInput(), { confirm: true });
        expect(res.headId).toBe(5000);
      }
    });

    it('si falla el encabezado (error definitivo) no se llama a ningún detalle', async () => {
      const { service, sim } = build();
      sim.failOn('liquidacion.crearEncabezado', 1, 'HTTP 400: NumberPF ya liquidada');
      await expect(service.submit('11271', usaInput(), { confirm: true })).rejects.toThrow(/ya liquidada/);
      expect(sim.details).toHaveLength(0);
    });
  });

  describe('reanudación: concurrencia, reinicios y fallos ambiguos', () => {
    it('dos reanudaciones SIMULTÁNEAS de la misma PF → solo una escribe (antes ambas recreaban lo pendiente)', async () => {
      const { service, sim } = build();
      sim.failOn('liquidacion.crearDetalle', 2, 'HTTP 500: Error en el SP');
      await expect(service.submit('99001', usaInput(), { confirm: true })).rejects.toThrow(BadRequestException);

      const [a, b] = await Promise.allSettled([
        service.submit('99001', usaInput(), { confirm: true, resume: true }),
        service.submit('99001', usaInput(), { confirm: true, resume: true }),
      ]);

      expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
      const rejected = [a, b].find((x) => x.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ConflictException);
      expect(sim.heads).toHaveLength(1);
      expect(sim.details.map((d) => d.codSecLineFilm)).toEqual([1, 2]); // la línea 2 una sola vez
    });

    it('el avance (id del encabezado) se persiste ANTES de crear los detalles, y el fallo queda con lastError/ambiguous', async () => {
      const { service, sim, idem } = build();
      sim.failOn('liquidacion.crearDetalle', 1, 'timeout: sin respuesta tras 60000ms');

      await expect(service.submit('11271', usaInput(), { confirm: true })).rejects.toThrow(BadRequestException);

      expect(idem.rows.get('liquidacion:11271')).toMatchObject({
        status: 'failed',
        result: { headId: 5000, detailsDone: [], ambiguous: true, lastError: expect.stringContaining('línea 113') },
      });
    });

    it('timeout en un detalle que SÍ quedó creado en Oben: detailsDone lo cierra sin duplicarlo', async () => {
      const { service, sim } = build();
      sim.failOn('liquidacion.crearDetalle', 2, 'timeout: sin respuesta tras 60000ms');
      await expect(service.submit('99001', usaInput(), { confirm: true })).rejects.toThrow(BadRequestException);
      const writesBefore = sim.writes().length;

      const res = await service.submit('99001', usaInput(), {
        confirm: true,
        resume: true,
        acknowledgeAmbiguous: true,
        detailsDone: [2],
      });

      expect(res).toMatchObject({ headId: 5000, detailsCreated: 2 });
      expect(sim.writes()).toHaveLength(writesBefore); // no se llamó a Oben otra vez
    });

    it('detailsDone con una línea que no es de la PF se rechaza antes de tocar la idempotencia', async () => {
      const { service, sim, idem } = build();
      sim.failOn('liquidacion.crearDetalle', 1, 'HTTP 500: Error en el SP');
      await expect(service.submit('11271', usaInput(), { confirm: true })).rejects.toThrow(BadRequestException);

      await expect(
        service.submit('11271', usaInput(), { confirm: true, resume: true, detailsDone: [999] }),
      ).rejects.toThrow(/no son de la PF 11271/);
      expect(idem.rows.get('liquidacion:11271')?.status).toBe('failed');
    });

    it.each([{ headId: 5000 }, { detailsDone: [113] }])(
      'en un primer envío (sin resume) %j se rechaza: declararía como existente algo que nunca se creó',
      async (extra) => {
        const { service, sim, idem } = build();
        await expect(service.submit('11271', usaInput(), { confirm: true, ...extra })).rejects.toThrow(/resume:true/);
        expect(sim.writes()).toHaveLength(0);
        expect(idem.rows.size).toBe(0);
      },
    );

    it('proceso muerto a mitad (reinicio): sin resume+acknowledgeAmbiguous sigue bloqueada, con ellos retoma sin duplicar', async () => {
      const { service, sim, idem } = build();
      idem.seedInterrupted('liquidacion:99001', { headId: 5000, detailsDone: [1] }, 30);

      await expect(service.submit('99001', usaInput(), { confirm: true })).rejects.toThrow(/reinicio/);
      await expect(service.submit('99001', usaInput(), { confirm: true, resume: true })).rejects.toThrow(ConflictException);
      expect(sim.writes()).toHaveLength(0);

      const res = await service.submit('99001', usaInput(), { confirm: true, resume: true, acknowledgeAmbiguous: true });

      expect(res).toMatchObject({ headId: 5000, detailsCreated: 2 });
      expect(sim.heads).toHaveLength(0); // el encabezado ya existía
      expect(sim.details.map((d) => [d.codSecLineFilm, d.codSecInvoiceDataComexHead])).toEqual([[2, 5000]]);
      expect(idem.rows.get('liquidacion:99001')?.status).toBe('completed');
    });

    it('una liquidación en processing CON avance reciente no se puede "retomar": podría estar corriendo ahora mismo', async () => {
      const { service, sim, idem } = build();
      idem.seedInterrupted('liquidacion:99001', { headId: 5000, detailsDone: [1] }, 1);

      await expect(
        service.submit('99001', usaInput(), { confirm: true, resume: true, acknowledgeAmbiguous: true }),
      ).rejects.toThrow(/hubo avance/);
      expect(sim.writes()).toHaveLength(0);
    });

    it('timeout en el ENCABEZADO: resume exige acknowledgeAmbiguous; con headId no se crea un segundo encabezado', async () => {
      const { service, sim } = build();
      sim.failOn('liquidacion.crearEncabezado', 1, 'timeout: sin respuesta tras 60000ms');
      await expect(service.submit('11271', usaInput(), { confirm: true })).rejects.toThrow(BadRequestException);

      await expect(service.submit('11271', usaInput(), { confirm: true, resume: true })).rejects.toThrow(/ambiguo/);
      const res = await service.submit('11271', usaInput(), { confirm: true, resume: true, acknowledgeAmbiguous: true, headId: 7777 });

      expect(res).toMatchObject({ headId: 7777, detailsCreated: 1 });
      expect(sim.writes().filter((w) => w.op === 'liquidacion.crearEncabezado')).toHaveLength(1); // solo el intento original
      expect(sim.details[0].codSecInvoiceDataComexHead).toBe(7777);
    });

    it.each([
      ['HTTP 504: Gateway Time-out', true],
      ['HTTP 502: Bad Gateway', true],
      ['TypeError: fetch failed', true],
      ['This operation was aborted', true],
      ['HTTP 500: Error en el SP', false],
      ['HTTP 400: NumberPF ya liquidada', false],
      ['circuit_open: demasiados fallos consecutivos', false],
    ])('error %j → ambiguo=%s', async (error, ambiguous) => {
      const { service, sim, idem } = build();
      sim.failOn('liquidacion.crearDetalle', 1, error);
      await expect(service.submit('11271', usaInput(), { confirm: true })).rejects.toThrow(BadRequestException);
      expect((idem.rows.get('liquidacion:11271')?.result as { ambiguous: boolean }).ambiguous).toBe(ambiguous);
    });

    it('una excepción inesperada del hub se trata como ambigua (no se sabe qué llegó a Oben)', async () => {
      const { service, sim, idem } = build();
      const original = sim.call.bind(sim);
      sim.call = async (system: string, op: string, args: Record<string, unknown>, options?: unknown) => {
        if (op === 'liquidacion.crearDetalle') throw new Error('boom');
        return original(system, op, args, options);
      };

      await expect(service.submit('11271', usaInput(), { confirm: true })).rejects.toThrow(/boom/);
      expect(idem.rows.get('liquidacion:11271')).toMatchObject({ status: 'failed', result: { ambiguous: true } });
    });

    it('una PF ya completada devuelve alreadyDone aunque se pida resume (nunca reescribe)', async () => {
      const { service, sim } = build();
      await service.submit('11271', usaInput(), { confirm: true });
      const before = sim.writes().length;

      const res = await service.submit('11271', usaInput(), { confirm: true, resume: true, acknowledgeAmbiguous: true, headId: 1 });

      expect(res).toMatchObject({ alreadyDone: true, headId: 5000 });
      expect(sim.writes()).toHaveLength(before);
    });
  });

  describe('datos de Oben que no son números reales', () => {
    it.each([[null], [''], ['abc'], [true]])('Precio=%j → error claro, NUNCA un precio 0', async (precio) => {
      const { service, sim } = build();
      const original = sim.call.bind(sim);
      sim.call = async (system: string, op: string, args: Record<string, unknown>, options?: unknown) =>
        op === 'liquidacion.consultar'
          ? { ok: true, data: { ...(CHECK['11271'] as object), Detalle: [{ CodSed_LineFilm: 113, TipoPelicula: 'X', Precio: precio, KilosTotales: 10 }] } }
          : original(system, op, args, options);

      await expect(service.getDraft('11271')).rejects.toThrow(/Línea de liquidación inválida/);
    });

    it('números que llegan como string se aceptan', async () => {
      const { service, sim } = build();
      const original = sim.call.bind(sim);
      sim.call = async (system: string, op: string, args: Record<string, unknown>, options?: unknown) =>
        op === 'liquidacion.consultar'
          ? { ok: true, data: { ...(CHECK['11271'] as object), Detalle: [{ CodSed_LineFilm: '113', TipoPelicula: 'X', Precio: '2.827', KilosTotales: '1339.42' }] } }
          : original(system, op, args, options);

      const draft = await service.getDraft('11271');
      expect(draft.lines[0]).toMatchObject({ codSecLineFilm: 113, valueTotal: 3786.54 });
    });

    it('un cargo de USA digitado como texto no cuenta como valor (no se manda "110" a Oben)', async () => {
      const { service } = build();
      const draft = await service.getDraft('11271', {
        header: { ...HEADER_USER, ...USA_CHARGES, inlandFreight: '900' as unknown as number },
      });
      expect(draft.missing).toContain('Encabezado (destino USA) — Inland Freight');
      expect(draft.readyToSubmit).toBe(false);
    });
  });

  describe('fórmula de Incoterm SIMULADA — candado contra envíos reales', () => {
    const simulada = () => build({ calculator: new SimulatedIncotermCalculator() });
    const HEADER_CO = { direccion: 'Cra 1', puertoArribo: 'Buenaventura', puertoEmbarque: 'Cartagena', paNcm: '3920.20', paNaladi: '3920.20.00' };

    it('con la fórmula simulada un borrador puede quedar completo, pero declara simulated:true', async () => {
      const { service } = simulada();

      const draft = await service.getDraft('11357', { header: HEADER_CO });

      expect(draft.readyToSubmit).toBe(true);
      expect(draft.simulated).toBe(true);
      // DAP de ejemplo sobre la PF 11357 real (ver liquidacion-value-calculator.spec.ts).
      expect(draft.incoterm).toBe('DAP');
      expect(draft.lines[0]).toMatchObject({ valueFreight: 679.34, valueSure: 8.19, expensesOther: 161.34, valueFOB: 15286.94 });
    });

    it('USA con cargos del maestro + digitados: también completo y simulado', async () => {
      const { service } = simulada();
      const draft = await service.getDraft('11271', usaInput());
      expect(draft).toMatchObject({ readyToSubmit: true, simulated: true, esUSA: true });
    });

    it('dry-run (sin confirm) SÍ se permite: devuelve los payloads marcados como simulados y no escribe nada', async () => {
      const { service, sim, idem } = simulada();

      const res = await service.submit('11357', { header: HEADER_CO });

      expect(res).toMatchObject({ dryRun: true, simulated: true });
      expect(res.payloads?.details[0]).toMatchObject({ valueFreight: 679.34 });
      expect(sim.writes()).toHaveLength(0);
      expect(idem.rows.size).toBe(0);
    });

    it('confirm:true con la fórmula simulada se RECHAZA antes de tocar la idempotencia o Oben', async () => {
      const { service, sim, idem, audit } = simulada();

      await expect(service.submit('11357', { header: HEADER_CO }, { confirm: true })).rejects.toThrow(/SIMULADA/);

      expect(sim.writes()).toHaveLength(0);
      expect(idem.rows.size).toBe(0);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('tampoco se puede usar para REANUDAR una liquidación a medias (el registro queda intacto)', async () => {
      const { service, sim, idem } = simulada();
      idem.rows.set('liquidacion:11357', { status: 'failed', result: { headId: 5000, detailsDone: [] }, updatedAt: Date.now() });

      await expect(
        service.submit('11357', { header: HEADER_CO }, { confirm: true, resume: true, acknowledgeAmbiguous: true, headId: 5000 }),
      ).rejects.toThrow(/SIMULADA/);

      expect(sim.writes()).toHaveLength(0);
      expect(idem.rows.get('liquidacion:11357')?.status).toBe('failed');
    });

    it('el rechazo aplica aunque el borrador simulado esté incompleto (el motivo es la fórmula, no los datos)', async () => {
      const { service } = simulada();
      await expect(service.submit('11357', {}, { confirm: true })).rejects.toThrow(/SIMULADA/);
    });

    it('con el calculador de producción el borrador NO es simulado, y sin datos del envío no está listo', async () => {
      const { service } = build({ calculator: new IncotermFormulaCalculator() });
      const draft = await service.getDraft('11357', { header: HEADER_CO });
      expect(draft.simulated).toBe(false);
      expect(draft.readyToSubmit).toBe(false);
      expect(draft.missing).toContain('Incoterm de la PF (EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP)');
    });
  });

  describe('fórmula de José a través del servicio (Incoterm, candado sinConfirmar, HMF)', () => {
    const jose = () => build({ calculator: new IncotermFormulaCalculator() });
    // PF 99001: 2 líneas (100 kg × 2 USD, 200 kg × 3 USD), destino USA.
    const cfr = (flete: number) => usaInput({ totales: { incoterm: 'cfr', flete } });

    it('CFR (José: solo flete): con el flete digitado el borrador queda completo, prorrateado por kilos', async () => {
      const { service } = jose();
      const draft = await service.getDraft('99001', cfr(300));
      expect(draft).toMatchObject({ incoterm: 'CFR', readyToSubmit: true, simulated: false, missing: [] });
      expect(draft.lines.map((l) => [l.valueFreight, l.valueSure, l.expensesOther, l.valueFOB])).toEqual([
        [100, 0, 0, 100], // 200 − 100
        [200, 0, 0, 400], // 600 − 200
      ]);
    });

    it('USA: Harbor Maintenance Fee se pide sobre el FOB FINAL (100 + 400), no sobre el valor bruto (800)', async () => {
      const { service, rates } = jose();
      await service.getDraft('99001', cfr(300));
      // La hoja del forwarder viene por país de ORIGEN de la ruta a USA (no hay fila "USA").
      expect(rates.resolveSurcharges).toHaveBeenCalledWith('t1', 'Colombia', 500);
    });

    it('sin FOB final calculable, el maestro de tarifas no recibe un FOB inventado', async () => {
      const { service, rates } = jose();
      await service.getDraft('99001', usaInput({ totales: {} }));
      expect(rates.resolveSurcharges).toHaveBeenCalledWith('t1', 'Colombia', undefined);
    });

    it.each([
      [{}, 'Incoterm de la PF (EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP)'],
      [{ incoterm: 'XYZ' }, 'Incoterm XYZ: no es un Incoterm 2020 (EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP)'],
      [{ incoterm: 'CIF', flete: 300, valorPoliza: 1 }, 'Envío (CIF) — Valor de la póliza (divisor del seguro, mayor a 1)'],
      [{ incoterm: 'CPT' }, 'Envío (CPT) — Flete total'],
      // La póliza vigente (1.00053) se usa por defecto; una digitada inválida no.
      [{ incoterm: 'DDP', flete: 300, otrosGastos: 10, valorPoliza: 1 }, 'Envío (DDP) — Valor de la póliza (divisor del seguro, mayor a 1)'],
    ])('datos del envío %j → falta "%s"', async (totales, falta) => {
      const { service } = jose();
      const draft = await service.getDraft('99001', usaInput({ totales }));
      expect(draft.missing).toContain(falta);
      expect(draft.readyToSubmit).toBe(false);
    });

    it('fuera de USA, DAP sin otros gastos digitados → faltan (no hay Destination Charges que los defina)', async () => {
      const { service } = jose();
      const draft = await service.getDraft('11357', { totales: { incoterm: 'DAP', flete: 300 } });
      expect(draft.missing).toContain('Envío (DAP) — Otros gastos totales');
      expect(draft.totales.valorPoliza).toBe(1.00053);
    });

    it('USA con DAP sin otros gastos digitados → se toman de Destination Charges y se informa', async () => {
      const { service } = jose();
      const draft = await service.getDraft('99001', usaInput({ totales: { incoterm: 'DAP', flete: 300 } }));
      expect(draft.totales.otrosGastos).toBe(1034.73);
      expect(draft.ajustes.filter(deTarifas)).toEqual(['Otros costos destino = Destination Charges (USD 1034.73 = Inland + Entry + ISF + HMF).']);
    });

    it('un flete mayor que el valor de la mercancía (typo) deja el FOB negativo → bloquea', async () => {
      const { service } = jose();
      const draft = await service.getDraft('99001', cfr(3000));
      expect(draft.missing.some((m) => m.includes('FOB final negativo'))).toBe(true);
      expect(draft.readyToSubmit).toBe(false);
    });

    it('dry-run permitido: devuelve los payloads y lo que falta confirmar, sin escribir nada', async () => {
      const { service, sim, idem } = jose();
      const res = await service.submit('99001', cfr(300));
      expect(res).toMatchObject({ dryRun: true, simulated: false });
      expect(res.sinConfirmar?.length).toBeGreaterThan(0);
      expect(res.payloads?.details.map((d) => d.valueFreight)).toEqual([100, 200]);
      // Los datos del envío alimentan la fórmula; no van en el encabezado a Oben.
      expect(res.payloads?.header).not.toHaveProperty('incoterm');
      expect(res.payloads?.header).not.toHaveProperty('flete');
      expect(sim.writes()).toHaveLength(0);
      expect(idem.rows.size).toBe(0);
    });

    it('USA: Destination Charges = Inland + Entry + ISF + HMF, siempre calculado (aunque se digite otro)', async () => {
      const { service } = jose();
      const draft = await service.getDraft('99001', cfr(300)); // USA_CHARGES trae destinationCharges: 150 digitado
      expect(draft.header.destinationCharges).toBe(1034.73); // 900 + 110 + 20 + 4.73
      expect(draft.headerOrigen).toMatchObject({ destinationCharges: 'calculado', entryFee: 'maestro', inlandFreight: 'usuario' });
    });

    it('USA con DAP: si otros costos destino ≠ Destination Charges, se reemplazan y se recalcula todo (José)', async () => {
      const { service } = jose();
      const draft = await service.getDraft('99001', usaInput({ totales: { incoterm: 'DAP', flete: 300, otrosGastos: 50 } }));

      expect(draft.totales.otrosGastos).toBe(1034.73);
      expect(draft.ajustes.filter(deTarifas)).toEqual([expect.stringContaining('USD 50.00) ≠ Destination Charges (USD 1034.73')]);
      const otros = draft.lines.map((l) => l.expensesOther!);
      expect(Math.round(otros.reduce((a, b) => a + b, 0) * 100)).toBe(103473); // 1034.73 repartido por kilos
      expect(draft.lines[0]).toMatchObject({ expensesOther: 344.91, expensesOtherUnit: 3.4491 });
      // FOB recalculado con los nuevos otros gastos: 200 − 0.05 − 100 − 344.91 (PF sintética de solo USD 800 → negativo, se bloquea).
      expect(draft.lines[0].valueFOB).toBe(-244.96);
      expect(draft.missing.some((m) => m.includes('FOB final negativo'))).toBe(true);
    });

    it('USA con DAP: si ya cuadran, no hay ajuste', async () => {
      const { service } = jose();
      const draft = await service.getDraft('99001', usaInput({ totales: { incoterm: 'DAP', flete: 300, otrosGastos: 1034.73 } }));
      expect(draft.ajustes.filter(deTarifas)).toEqual([]);
      expect(draft.totales.otrosGastos).toBe(1034.73);
    });

    it('USA con un Incoterm sin otros gastos (CFR): no descuenta Destination Charges y lo deja pendiente de confirmar', async () => {
      const { service } = jose();
      const draft = await service.getDraft('99001', cfr(300));
      expect(draft.lines.every((l) => l.expensesOther === 0)).toBe(true);
      expect(draft.sinConfirmar).toEqual(expect.arrayContaining([expect.stringContaining('Destino USA con CFR')]));
    });

    it('fuera de USA no se calcula Destination Charges', async () => {
      const { service } = jose();
      const draft = await service.getDraft('11357', { header: { direccion: 'x' }, totales: { incoterm: 'CFR', flete: 100 } });
      expect(draft.header.destinationCharges).toBeUndefined();
      expect(draft.sinConfirmar.some((m) => m.includes('Destino USA'))).toBe(false);
    });

    it('confirm:true se RECHAZA mientras quede algo sin validar con Oben — antes de la idempotencia o de Oben', async () => {
      const { service, sim, idem, audit, cierre } = jose();
      await expect(service.submit('99001', cfr(300), { confirm: true })).rejects.toThrow(/José aún no confirma/);
      expect(sim.writes()).toHaveLength(0);
      expect(idem.rows.size).toBe(0);
      expect(audit.log).not.toHaveBeenCalled();
      expect(cierre.enviarTrasCompletar).not.toHaveBeenCalled();
    });
  });

  describe('correo de cierre (OBEN MAS §1.2): solo cuando la liquidación CONCLUYE en Oben', () => {
    it('al completar, dispara el correo una vez y guarda OV/cliente/simulated:false en el evento de completado', async () => {
      const { service, cierre, audit } = build();

      const res = await service.submit('11271', usaInput(), { confirm: true });

      expect(cierre.enviarTrasCompletar).toHaveBeenCalledTimes(1);
      expect(cierre.enviarTrasCompletar).toHaveBeenCalledWith('11271');
      expect(res.cierre).toMatchObject({ sent: true });
      const done = audit.log.mock.calls.find((c) => c[0].action === 'liquidacion_completada')![0];
      expect(done.outputData).toMatchObject({ ordenVenta: '11086', cliente: 'OBEN US, LLC', simulated: false });
      // El correo sale DESPUÉS de registrar la liquidación como completada.
      const completedAt = audit.log.mock.invocationCallOrder[audit.log.mock.calls.indexOf(audit.log.mock.calls.find((c) => c[0].action === 'liquidacion_completada')!)];
      expect(cierre.enviarTrasCompletar.mock.invocationCallOrder[0]).toBeGreaterThan(completedAt);
    });

    it('un dry-run, una liquidación a medias o una PF ya liquidada NO disparan el correo', async () => {
      const { service, sim, cierre } = build();
      await service.submit('11271', usaInput());
      sim.failOn('liquidacion.crearDetalle', 1, 'HTTP 500: Error en el SP');
      await expect(service.submit('11271', usaInput(), { confirm: true })).rejects.toThrow(BadRequestException);
      expect(cierre.enviarTrasCompletar).not.toHaveBeenCalled();

      await service.submit('11271', usaInput(), { confirm: true, resume: true }); // completa → 1 correo
      await service.submit('11271', usaInput(), { confirm: true }); // alreadyDone → ninguno más
      expect(cierre.enviarTrasCompletar).toHaveBeenCalledTimes(1);
    });

    it('con la fórmula simulada nunca se llega a disparar (el candado rechaza antes)', async () => {
      const { service, cierre } = build({ calculator: new SimulatedIncotermCalculator() });
      await expect(service.submit('11271', usaInput(), { confirm: true })).rejects.toThrow(/SIMULADA/);
      expect(cierre.enviarTrasCompletar).not.toHaveBeenCalled();
    });

    it('si el correo no sale, la liquidación (ya creada en Oben) NO falla: el resultado lo informa para reintentar', async () => {
      const { service, cierre, idem } = build();
      cierre.enviarTrasCompletar.mockResolvedValueOnce({
        sent: false, numberPF: '11271', to: [], cc: [], adjuntos: [], simulated: false, error: 'smtp down',
      } as never);

      const res = await service.submit('11271', usaInput(), { confirm: true });

      expect(res).toMatchObject({ dryRun: false, headId: 5000, detailsCreated: 1, cierre: { sent: false, error: 'smtp down' } });
      expect(idem.rows.get('liquidacion:11271')?.status).toBe('completed');
    });
  });

  describe('OV 11187 / PF 11366 real (OBEN US, Dallas): todo lo de destino sale solo de Oben y de la tabla de fletes', () => {
    // Respuesta REAL de APILiquidacionParadixe para la PF 11366 (2026-10-01), sobre la línea de la 11271.
    const OBEN_11366 = {
      Direccion: '2144 FRENCH SETTLEMENT RD\r\nDallas TX 75212\r\nUSA',
      PuertoEmbarque: 'CARTAGENA - COLOMBIA',
      PuertoArribo: 'DALLAS, TX 75212',
    };
    const DALLAS = { inlandFreight: 1744, destinationPort: 'Houston, TX (Port)', destinationAddress: 'Dallas, TX 75212', validUntil: '2026-08-31', vencida: true };
    const armar = () => {
      const built = build({ calculator: new IncotermFormulaCalculator() });
      const original = built.sim.call.bind(built.sim);
      built.sim.call = async (system: string, op: string, args: Record<string, unknown>, options?: unknown) =>
        op === 'liquidacion.consultar' ? { ok: true, data: { ...(CHECK['11271'] as object), ...OBEN_11366 } } : original(system, op, args, options);
      built.rates.resolveInlandByAddress.mockResolvedValue(DALLAS);
      return built;
    };
    const PARTIDAS = { paNcm: '3920.62.00', paNaladi: '3920.62.00' };

    it('con solo Incoterm, flete y partidas digitados, la liquidación queda COMPLETA', async () => {
      const { service, rates } = armar();
      const draft = await service.getDraft('11271', { header: PARTIDAS, totales: { incoterm: 'DAP', flete: 1200 } });

      expect(draft.header).toMatchObject({
        direccion: '2144 FRENCH SETTLEMENT RD, Dallas TX 75212, USA', // una sola línea
        puertoEmbarque: 'CARTAGENA - COLOMBIA',
        puertoArribo: 'DALLAS, TX 75212',
        inlandFreight: 1744,
        entryFee: 110,
        importerSecurityFiling: 20,
        destinationCharges: 1878.73, // 1744 + 110 + 20 + 4.73
      });
      expect(draft.headerOrigen).toMatchObject({ direccion: 'oben', puertoArribo: 'oben', inlandFreight: 'maestro', destinationCharges: 'calculado' });
      expect(rates.resolveInlandByAddress).toHaveBeenCalledWith('t1', 'USA', expect.stringContaining('75212'));
      expect(draft.totales.otrosGastos).toBe(1878.73); // otros costos destino = Destination Charges, sin digitarlos
      expect(draft.ajustes.filter(deTarifas)).toEqual([
        expect.stringContaining('venció el 2026-08-31'),
        'Otros costos destino = Destination Charges (USD 1878.73 = Inland + Entry + ISF + HMF).',
      ]);
      expect(draft.missing).toEqual([]);
      expect(draft.readyToSubmit).toBe(true);
    });

    it('sin flete digitado, el flete marítimo sale de la tabla (pata 2) hasta el puerto del que sale el Inland', async () => {
      const { service, rates } = armar();
      rates.resolveOceanFreight.mockResolvedValue({
        flete: 941, origen: 'Cartagena, Colombia (COCTG) - Port', destino: 'Houston, TX (Port)', forwarder: 'Direct', naviera: 'Hapag-Lloyd', validUntil: '2026-10-30', vencida: false,
      });
      const draft = await service.getDraft('11271', { header: PARTIDAS, totales: { incoterm: 'DAP' } });
      expect(rates.resolveOceanFreight).toHaveBeenCalledWith('t1', 'CARTAGENA - COLOMBIA', 'Houston, TX (Port)', 'DALLAS, TX 75212');
      expect(draft.totales.flete).toBe(941);
      expect(draft.totalesOrigen).toEqual({ flete: 'maestro', otrosGastos: 'calculado' });
      expect(draft.ajustes.filter(deTarifas)).toEqual(
        expect.arrayContaining([
          "Flete marítimo de la tabla de fletes: Cartagena, Colombia (COCTG) - Port → Houston, TX (Port) (Direct / Hapag-Lloyd, contenedor 40'), USD 941.00.",
        ]),
      );
      expect(draft.lines[0].valueFreight).toBe(941);
      expect(draft.missing).toEqual([]);
    });

    it('un flete digitado manda sobre la tabla (ni se consulta)', async () => {
      const { service, rates } = armar();
      const draft = await service.getDraft('11271', { header: PARTIDAS, totales: { incoterm: 'DAP', flete: 1200 } });
      expect(draft.totales.flete).toBe(1200);
      expect(draft.totalesOrigen.flete).toBe('usuario');
      expect(rates.resolveOceanFreight).not.toHaveBeenCalled();
    });

    it("más de 26.000 kg: flete e Inland se cobran por cada contenedor de 40'", async () => {
      const built = armar();
      const pesado = { ...(CHECK['11271'] as { Detalle: Array<Record<string, unknown>> }) };
      pesado.Detalle = pesado.Detalle.map((l) => ({ ...l, KilosTotales: 30000 }));
      const original = built.sim.call;
      built.sim.call = async (system: string, op: string, args: Record<string, unknown>, options?: unknown) =>
        op === 'liquidacion.consultar' ? { ok: true, data: { ...pesado, ...OBEN_11366 } } : original(system, op, args, options);
      built.rates.resolveOceanFreight.mockResolvedValue({ flete: 941, origen: 'Cartagena', destino: 'Houston, TX (Port)', forwarder: 'Direct', naviera: null, validUntil: null, vencida: false });
      const draft = await built.service.getDraft('11271', { header: PARTIDAS, totales: { incoterm: 'DAP' } });
      const contenedores = Math.ceil(draft.lines.reduce((a, l) => a + (l.kilosTotal ?? 0), 0) / 26000);
      expect(contenedores).toBeGreaterThan(1);
      expect(draft.totales.flete).toBe(941 * contenedores);
      expect(draft.header.inlandFreight).toBe(1744 * contenedores);
      expect(draft.ajustes.join(' ')).toContain(`× ${contenedores} contenedores`);
    });

    it('un Inland digitado manda sobre la tabla (ni se consulta)', async () => {
      const { service, rates } = armar();
      const draft = await service.getDraft('11271', { header: { ...PARTIDAS, inlandFreight: 900 }, totales: { incoterm: 'DAP', flete: 1200 } });
      expect(draft.header.inlandFreight).toBe(900);
      expect(draft.headerOrigen.inlandFreight).toBe('usuario');
      expect(rates.resolveInlandByAddress).not.toHaveBeenCalled();
    });

    it('sin tarifa Inland para ese destino: otros gastos y Destination Charges quedan como faltantes (no se calcula con 0)', async () => {
      const { service, rates } = armar();
      rates.resolveInlandByAddress.mockResolvedValue({ inlandFreight: null, destinationPort: null, destinationAddress: null, validUntil: null, vencida: false });
      const draft = await service.getDraft('11271', { header: PARTIDAS, totales: { incoterm: 'DAP', flete: 1200 } });
      expect(draft.missing).toEqual(
        expect.arrayContaining(['Encabezado (destino USA) — Inland Freight', 'Envío (DAP) — Otros gastos totales']),
      );
      expect(draft.lines[0].valueFOB).toBeUndefined();
    });
  });

  describe('valores PROVISIONALES mientras Oben entrega sus tablas (Hernán, 2026-10-01)', () => {
    const prov = () => build({ calculator: new IncotermFormulaCalculator(), provisionales: true });
    const HEADER_USA = { ...HEADER_USER, inlandFreight: 1744 };
    delete (HEADER_USA as Record<string, unknown>).paNcm;
    delete (HEADER_USA as Record<string, unknown>).paNaladi;

    it('sin flete, partidas ni HMF calculable: se llenan, se avisan y la liquidación queda completa', async () => {
      const { service, rates } = prov();
      rates.resolveSurcharges.mockResolvedValue({ entryFee: 110, importerSecurityFiling: 20, harborMaintenanceFee: null, harborMaintenanceFeeFormula: null, destinationCharges: null, missing: [] });
      const draft = await service.getDraft('11271', { header: HEADER_USA, totales: { incoterm: 'DDP' } });

      expect(draft.header).toMatchObject({ paNcm: '3920.62.00', paNaladi: '3920.62.00', harborMaintenanceFee: 300, destinationCharges: 2174 });
      expect(draft.headerOrigen).toMatchObject({ paNcm: 'provisional', paNaladi: 'provisional', harborMaintenanceFee: 'provisional' });
      expect(draft.totales.flete).toBe(0);
      expect(draft.ajustes.filter(deTarifas)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Flete marítimo en 0'),
          expect.stringContaining('Partida arancelaria PROVISIONAL 3920.62.00'),
          expect.stringContaining('Harbor Maintenance Fee PROVISIONAL USD 300'),
        ]),
      );
      expect(draft.ajustes.some((a) => a.includes('arancel 10'))).toBe(false);
      expect(draft.missing).toEqual([]);
    });

    it('arancel de importación (Jorge, 5-oct): en EE. UU. se informa 12,5 % y no entra en el cálculo', async () => {
      const { service, rates } = prov();
      rates.resolveSurcharges.mockResolvedValue({ entryFee: 110, importerSecurityFiling: 20, harborMaintenanceFee: null, harborMaintenanceFeeFormula: null, destinationCharges: null, missing: [] });
      const base = await service.getDraft('11271', { header: HEADER_USA, totales: { incoterm: 'DDP' } });

      expect(base.esUSA).toBe(true);
      expect(base.ajustes).toContain(
        'Arancel de importación EE. UU.: 12.5 % (Jorge, 5-oct). No entra en la liquidación: falta confirmar sobre qué base se calcula, si aplica a todas las películas y si solo cuenta con DDP.',
      );
      expect(base.sinConfirmar.some((s) => s.includes('Arancel'))).toBe(false);
    });

    it('lo digitado manda: flete y partidas del usuario no se tocan; el HMF calculable usa la regla de José', async () => {
      const { service } = prov();
      const draft = await service.getDraft('11271', {
        header: { ...HEADER_USA, paNcm: '3920.62.19', paNaladi: '3920.62.00' },
        totales: { incoterm: 'DDP', flete: 1200 },
      });
      expect(draft.totales.flete).toBe(1200);
      expect(draft.header).toMatchObject({ paNcm: '3920.62.19', harborMaintenanceFee: 4.73 });
      expect(draft.headerOrigen).toMatchObject({ paNcm: 'usuario', harborMaintenanceFee: 'maestro' });
      expect(draft.ajustes.some((a) => a.includes('PROVISIONAL') || a.includes('Flete marítimo en 0'))).toBe(false);
    });

    it('sin la opción (por defecto en los tests y fuera de producción) nada se llena: siguen como faltantes', async () => {
      const { service } = build({ calculator: new IncotermFormulaCalculator() });
      const draft = await service.getDraft('11271', { header: HEADER_USA, totales: { incoterm: 'DDP' } });
      expect(draft.missing).toEqual(expect.arrayContaining(['Encabezado — Partida arancelaria NCM', 'Envío (DDP) — Flete total']));
    });
  });

  describe('Incoterm desde el ERP de Oben (spCheckSalesOrderComex_Paradixe)', () => {
    const comexCon = (incoterm: string | null) =>
      `{"NroProforma":"11357","Mercado":"EXPORTACION","Cliente":"X","Pais":"COLOMBIA"${incoterm ? `,"Incoterm":"${incoterm}"` : ''},"OrdenesVenta":[]}`;
    const armar = (respuesta: unknown) => {
      const built = build({ calculator: new IncotermFormulaCalculator() });
      const original = built.sim.call.bind(built.sim);
      const comex: Array<{ options: unknown }> = [];
      built.sim.call = async (system: string, op: string, args: Record<string, unknown>, options?: unknown) => {
        if (op !== 'query.run' || args.procedure !== 'spCheckSalesOrderComex_Paradixe') return original(system, op, args, options);
        comex.push({ options });
        if (respuesta instanceof Error) throw respuesta;
        return { ok: true, data: respuesta };
      };
      return { ...built, comex };
    };

    it('si el usuario no escoge, se toma el de Oben y se marca su origen', async () => {
      const { service } = armar(comexCon('CFR'));
      const draft = await service.getDraft('11357', { totales: { flete: 100 } });
      expect(draft).toMatchObject({ incoterm: 'CFR', incotermOrigen: 'oben' });
      expect(draft.missing.some((m) => m.startsWith('Incoterm'))).toBe(false);
    });

    it('lo escogido por el usuario manda y ni se consulta a Oben', async () => {
      const { service, comex } = armar(comexCon('CFR'));
      const draft = await service.getDraft('11357', { totales: { incoterm: 'FCA' } });
      expect(draft).toMatchObject({ incoterm: 'FCA', incotermOrigen: 'usuario' });
      expect(comex).toHaveLength(0);
    });

    it('hoy Oben no trae el campo: sigue faltando (nada se inventa)', async () => {
      const { service } = armar(comexCon(null));
      const draft = await service.getDraft('11357');
      expect(draft).toMatchObject({ incoterm: null, incotermOrigen: null });
      expect(draft.missing).toContain('Incoterm de la PF (EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP)');
    });

    it('el reporte (todas las proformas) se pide una sola vez por PF: queda en caché', async () => {
      const { service, comex } = armar(comexCon('CFR'));
      await service.getDraft('11357');
      await service.getDraft('11357', { header: { direccion: 'x' } });
      expect(comex).toHaveLength(1);
      expect(comex[0].options).toMatchObject({ maxAttempts: 1 });
    });

    it('país: si la Lista de Empaque no lo trae, se toma del reporte de proformas de Oben', async () => {
      const { service, sim } = armar(`{"NroProforma":"11357","Pais":"USA","Incoterms":"DDP","OrdenesVenta":[]}`);
      const original = sim.call.bind(sim);
      sim.call = async (system: string, op: string, args: Record<string, unknown>, options?: unknown) =>
        op === 'query.run' && args.procedure === 'spEmpaqueUnificada_Paradixe' ? { ok: true, data: {} } : original(system, op, args, options);
      const draft = await service.getDraft('11357');
      expect(draft).toMatchObject({ pais: 'USA', esUSA: true, incoterm: 'DDP', incotermOrigen: 'oben' });
      expect(draft.missing.some((m) => m.startsWith('País de destino'))).toBe(false);
    });

    it('país: sin Empaque ni reporte, sale de la dirección de destino ("…Dallas TX 75212, USA")', async () => {
      const { service, sim } = armar(new Error('timeout'));
      const original = sim.call.bind(sim);
      sim.call = async (system: string, op: string, args: Record<string, unknown>, options?: unknown) => {
        if (op === 'query.run' && args.procedure === 'spEmpaqueUnificada_Paradixe') return { ok: true, data: {} };
        if (op === 'liquidacion.consultar') return { ok: true, data: [{ ...(CHECK['11357'] as object), Direccion: ['2144 FRENCH SETTLEMENT RD', 'Dallas TX 75212', 'USA'].join(String.fromCharCode(13, 10)) }] };
        return original(system, op, args, options);
      };
      const draft = await service.getDraft('11357');
      expect(draft).toMatchObject({ pais: 'USA', esUSA: true });
    });

    it('si Oben falla, el borrador sale igual (sin Incoterm), nunca se cae', async () => {
      const { service } = armar(new Error('timeout'));
      const draft = await service.getDraft('11357');
      expect(draft.incoterm).toBeNull();
    });
  });

  describe('dirección y puertos por defecto desde spCheckSettlement (José, pregunta 9)', () => {
    const conDefaults = (extra: Record<string, unknown>) => {
      const built = build();
      const original = built.sim.call.bind(built.sim);
      built.sim.call = async (system: string, op: string, args: Record<string, unknown>, options?: unknown) =>
        op === 'liquidacion.consultar' ? { ok: true, data: { ...(CHECK['11357'] as object), ...extra } } : original(system, op, args, options);
      return built;
    };

    it('los toma del SP y los marca con origen "oben"', async () => {
      const { service } = conDefaults({ Direccion: 'Cra 50 # 10-20, Lima', PuertoArribo: 'Callao', PuertoEmbarque: 'Cartagena' });
      const draft = await service.getDraft('11357');
      expect(draft.header).toMatchObject({ direccion: 'Cra 50 # 10-20, Lima', puertoArribo: 'Callao', puertoEmbarque: 'Cartagena' });
      expect(draft.headerOrigen).toMatchObject({ direccion: 'oben', puertoArribo: 'oben', puertoEmbarque: 'oben' });
      expect(draft.missing.some((m) => m.includes('Puerto'))).toBe(false);
    });

    it('lo que digita el usuario los reemplaza (un campo en blanco no borra el de Oben)', async () => {
      const { service } = conDefaults({ Direccion: 'Cra 50', Puerto_Arribo: 'Callao' });
      const draft = await service.getDraft('11357', { header: { direccion: 'Bodega 9', puertoArribo: '  ' } });
      expect(draft.header).toMatchObject({ direccion: 'Bodega 9', puertoArribo: 'Callao' });
      expect(draft.headerOrigen).toMatchObject({ direccion: 'usuario', puertoArribo: 'oben' });
    });

    it('si el SP no los trae, siguen como faltantes (no se inventan)', async () => {
      const { service } = conDefaults({});
      const draft = await service.getDraft('11357');
      expect(draft.missing).toEqual(expect.arrayContaining(['Encabezado — Dirección', 'Encabezado — Puerto de arribo']));
    });
  });

  describe('lo que digita el usuario manda sobre los defaults', () => {
    it('los valores de encabezado del usuario (p. ej. otro Entry Fee) sobrescriben el maestro de tarifas', async () => {
      const { service } = build();
      const draft = await service.getDraft('11271', { header: { ...HEADER_USER, ...USA_CHARGES, entryFee: 200 } });
      expect(draft.header.entryFee).toBe(200);
      expect(draft.header.importerSecurityFiling).toBe(20);
    });

    it('un valor explícito 0 (p. ej. sin seguro) es válido — solo null/ausente cuenta como faltante', async () => {
      const { service } = build({ calculator: { simulated: false, compute: () => ({}) } });
      const line = {
        kilosTotalUnit: 1, valueTotal: 1, valueFOB: 1, valueFreight: 0, valueFreightUnit: 0, valueSure: 0, valueSureUnit: 0,
        expensesOther: 0, expensesOtherUnit: 0, subTotal: 1, total: 1, totalUnidad: 1,
      };
      const draft = await service.getDraft('11271', usaInput({ lines: { '113': line } }));
      expect(draft.missing).toEqual([]);
      expect(draft.readyToSubmit).toBe(true);
    });
  });
});

describe('Partida arancelaria de Colombia desde Parida (COMEX, 6-oct)', () => {
  const con = (parida: Array<string | null>) => {
    const sim = build({ calculator: { simulated: false, compute: () => ({}) } });
    const base = CHECK['99001'] as { Detalle: Array<Record<string, unknown>> };
    CHECK['99002'] = { ...base, Proforma: '99002', Detalle: base.Detalle.map((l, i) => ({ ...l, ...(parida[i] ? { Parida: parida[i] } : {}) })) };
    return sim.service;
  };

  it('todas las líneas con la misma Parida → Pa_Ncm = esa partida (origen Oben), no la de nuestra tabla', async () => {
    const draft = await con(['39.20.10.90', '39.20.10.90']).getDraft('99002');
    expect(draft.header.paNcm).toBe('39.20.10.90');
    expect(draft.headerOrigen.paNcm).toBe('oben');
    expect(draft.ajustes.join(' ')).toContain('Partida arancelaria de Colombia');
  });

  it('SKU con Parida distintas → no escoge: avisa y no inventa', async () => {
    const draft = await con(['39.20.10.90', '3920.62.00.90']).getDraft('99002');
    expect(draft.header.paNcm).toBeUndefined();
    expect(draft.ajustes.join(' ')).toContain('mezcla SKU con partidas distintas');
  });

  it('lo que digita el usuario manda sobre la Parida', async () => {
    const draft = await con(['39.20.10.90', '39.20.10.90']).getDraft('99002', { header: { paNcm: '3920.20.99' } });
    expect(draft.header.paNcm).toBe('3920.20.99');
    expect(draft.headerOrigen.paNcm).toBe('usuario');
  });
});

describe('COMEX aprueba la liquidación antes de enviarla a Oben (Hernán, 6-oct)', () => {
  const comex = { nombre: 'María Escobar' };

  it('sin aprobación el envío real se rechaza (403) y no escribe nada en Oben', async () => {
    const { service, sim } = build({ requiereAprobacion: true });
    await expect(service.submit('99001', usaInput(), { confirm: true })).rejects.toThrow(/COMEX/);
    expect(sim.heads).toHaveLength(0);
  });

  it('aprobada, el envío sale; el borrador muestra la aprobación vigente', async () => {
    const { service, sim } = build({ requiereAprobacion: true });
    const aprobado = await service.aprobar('99001', usaInput(), comex);
    expect(aprobado.aprobacion).toMatchObject({ existe: true, vigente: true, por: 'María Escobar' });
    const res = await service.submit('99001', usaInput(), { confirm: true });
    expect(res.dryRun).toBe(false);
    expect(sim.heads).toHaveLength(1);
  });

  it('si cambia cualquier valor después de aprobar, la aprobación deja de valer', async () => {
    const { service, sim } = build({ requiereAprobacion: true });
    await service.aprobar('99001', usaInput(), comex);
    const cambiado = usaInput({ header: { ...HEADER_USER, ...USA_CHARGES, notes: 'otra observación' } });
    await expect(service.submit('99001', cambiado, { confirm: true })).rejects.toThrow(/cambió después/);
    expect(sim.heads).toHaveLength(0);
    const d = await service.getDraft('99001', cambiado);
    expect(d.aprobacion).toMatchObject({ existe: true, vigente: false });
  });

  it('no se puede aprobar lo que no está listo para enviar (faltan datos)', async () => {
    const { service } = build({ requiereAprobacion: true });
    await expect(service.aprobar('11271', {}, comex)).rejects.toThrow(BadRequestException);
  });

  it('simular (sin confirm) no exige aprobación', async () => {
    const { service } = build({ requiereAprobacion: true });
    const r = await service.submit('99001', usaInput());
    expect(r.dryRun).toBe(true);
  });

  it('la aprobación queda en la auditoría', async () => {
    const { service, audit } = build({ requiereAprobacion: true });
    await service.aprobar('99001', usaInput(), comex);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'liquidacion_aprobada_comex', entityId: '99001' }));
  });
});
