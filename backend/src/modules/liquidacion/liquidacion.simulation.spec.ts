import { BadRequestException, ConflictException } from '@nestjs/common';
import { LiquidacionService } from './liquidacion.service';
import {
  PendingFormulaCalculator,
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
 * vivo — no hay sandbox), y la fórmula por Incoterm (José aún no la ha
 * compartido; aquí un calculador de prueba solo demuestra que el enchufe
 * funciona). Esta suite valida el ORDEN, la idempotencia y el manejo de
 * fallos — no los nombres de campo de las respuestas de escritura de Oben.
 */

const CHECK: Record<string, unknown> = {
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
    const sure = r(line.valueFOB * 0.01);
    const other = 5;
    const subTotal = r(line.valueFOB + freight + sure + other);
    return {
      kilosTotalUnit: 1,
      valueFreight: freight,
      valueFreightUnit: r(freight / line.kilosTotal),
      valueSure: sure,
      valueSureUnit: r(sure / line.kilosTotal),
      expensesOther: other,
      expensesOtherUnit: r(other / line.kilosTotal),
      valueTotal: subTotal,
      subTotal,
      total: subTotal,
      totalUnidad: r(subTotal / line.kilosTotal),
    };
  },
};

const HEADER_USER = { direccion: '1 Port Rd, Miami FL', puertoArribo: 'Miami', puertoEmbarque: 'Cartagena', paNcm: '3920.20', paNaladi: '3920.20.00', notes: 'prueba' };
const USA_CHARGES = { inlandFreight: 900, destinationCharges: 150 };

function build(opts: { calculator?: LiquidacionValueCalculator } = {}) {
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
  };
  const service = new LiquidacionService(
    sim as never,
    { tenantId: 't1', userId: 'u1' } as never,
    audit as never,
    idem as never,
    rates as never,
    opts.calculator ?? testCalculator,
  );
  return { service, sim, idem, audit, rates };
}

const usaInput = (extra: LiquidacionInput = {}): LiquidacionInput => ({ header: { ...HEADER_USER, ...USA_CHARGES }, ...extra });

describe('Liquidación — simulación completa (datos reales de spCheckSettlement, escrituras simuladas)', () => {
  describe('borrador con las respuestas REALES de Oben', () => {
    it('PF 11271 (USA): deriva kilos y FOB del SP, toma Entry Fee/ISF/Harbor del maestro, y lista lo que falta (nada se inventa)', async () => {
      const { service } = build({ calculator: { simulated: false, compute: () => ({}) } });
      const draft = await service.getDraft('11271');

      expect(draft.pais).toBe('USA');
      expect(draft.esUSA).toBe(true);
      expect(draft.cliente).toBe('OBEN US, LLC');
      expect(draft.lines).toHaveLength(1);
      expect(draft.lines[0]).toMatchObject({ codSecLineFilm: 113, kilosTotal: 1339.42, valueFOB: 3786.54 }); // 2.827 × 1339.42
      expect(draft.header).toMatchObject({ entryFee: 110, importerSecurityFiling: 20, harborMaintenanceFee: 4.73 });
      expect(draft.readyToSubmit).toBe(false);
      expect(draft.missing).toEqual(
        expect.arrayContaining([
          'Encabezado — Dirección',
          'Encabezado — Puerto de arribo',
          'Encabezado — Puerto de embarque',
          'Encabezado (destino USA) — Inland Freight',
          'Encabezado (destino USA) — Destination Charges',
          'Línea 113 (ENA--0012TM) — Valor flete',
          'Línea 113 (ENA--0012TM) — Total por unidad',
        ]),
      );
    });

    it('PF 11357 (Colombia, doméstica): NO exige los cargos de USA ni consulta el maestro de tarifas', async () => {
      const { service, rates } = build({ calculator: { simulated: false, compute: () => ({}) } });
      const draft = await service.getDraft('11357');

      expect(draft.esUSA).toBe(false);
      expect(draft.lines[0].valueFOB).toBe(16134.42); // 2.85 × 5661.20
      expect(rates.resolveSurcharges).not.toHaveBeenCalled();
      expect(draft.missing.some((m) => m.includes('USA'))).toBe(false);
    });

    it('PF 10867 (la ya liquidada de referencia): FOB = 2.55 × 22080.76', async () => {
      const { service } = build();
      const draft = await service.getDraft('10867');
      expect(draft.lines[0].valueFOB).toBe(56305.94);
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
      expect(draft.lines[0]).toMatchObject({ codSecLineFilm: 113, valueFOB: 3786.54 });
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
      expect(draft.lines[0]).toMatchObject({ valueFreight: 679.34, valueSure: 50.44, expensesOther: 161.34, total: 17025.54 });
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

    it('con el calculador de producción (fórmula pendiente) el borrador NO es simulado', async () => {
      const { service } = build({ calculator: new PendingFormulaCalculator() });
      const draft = await service.getDraft('11357', { header: HEADER_CO });
      expect(draft.simulated).toBe(false);
      expect(draft.readyToSubmit).toBe(false); // flete/seguro/otros siguen faltando
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
        kilosTotalUnit: 1, valueTotal: 1, valueFreight: 0, valueFreightUnit: 0, valueSure: 0, valueSureUnit: 0,
        expensesOther: 0, expensesOtherUnit: 0, subTotal: 1, total: 1, totalUnidad: 1,
      };
      const draft = await service.getDraft('11271', { header: { ...HEADER_USER, ...USA_CHARGES }, lines: { '113': line } });
      expect(draft.missing).toEqual([]);
      expect(draft.readyToSubmit).toBe(true);
    });
  });
});
