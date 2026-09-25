import { BadRequestException, ConflictException } from '@nestjs/common';
import { LiquidacionService } from './liquidacion.service';
import type { LiquidacionValueCalculator } from './liquidacion-value-calculator';
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

/** Misma semántica que IdempotencyService real (claim atómico, estados, resultado). */
class FakeIdempotency {
  rows = new Map<string, { status: 'processing' | 'completed' | 'failed'; result?: unknown; error?: string }>();
  async claim(_t: string, _e: string, key: string) {
    const ex = this.rows.get(key);
    if (ex) return { claimed: false, existingStatus: ex.status, existingResult: ex.result };
    this.rows.set(key, { status: 'processing' });
    return { claimed: true };
  }
  async saveProgress(_t: string, key: string, result: unknown) {
    this.rows.get(key)!.result = JSON.parse(JSON.stringify(result));
  }
  async markCompleted(_t: string, key: string, result: unknown) {
    Object.assign(this.rows.get(key)!, { status: 'completed', result: JSON.parse(JSON.stringify(result)) });
  }
  async markFailed(_t: string, key: string, error: string) {
    Object.assign(this.rows.get(key)!, { status: 'failed', error });
  }
}

/** SOLO PRUEBA — no es la fórmula real de José. */
const testCalculator: LiquidacionValueCalculator = {
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
      const { service } = build({ calculator: { compute: () => ({}) } });
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
      const { service, rates } = build({ calculator: { compute: () => ({}) } });
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
      const { service, sim } = build({ calculator: { compute: () => ({}) } });
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

  describe('lo que digita el usuario manda sobre los defaults', () => {
    it('los valores de encabezado del usuario (p. ej. otro Entry Fee) sobrescriben el maestro de tarifas', async () => {
      const { service } = build();
      const draft = await service.getDraft('11271', { header: { ...HEADER_USER, ...USA_CHARGES, entryFee: 200 } });
      expect(draft.header.entryFee).toBe(200);
      expect(draft.header.importerSecurityFiling).toBe(20);
    });

    it('un valor explícito 0 (p. ej. sin seguro) es válido — solo null/ausente cuenta como faltante', async () => {
      const { service } = build({ calculator: { compute: () => ({}) } });
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
