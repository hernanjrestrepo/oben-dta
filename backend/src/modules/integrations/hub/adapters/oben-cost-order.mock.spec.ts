import { StaticScenarioProvider } from '../static-scenario-provider';
import { ObenCostOrderMockAdapter } from './oben-cost-order.mock';
import { ObenCostOrderRealAdapter } from './oben-cost-order.real';

const CTX = { tenantId: 't1', userId: 'u1' };

describe('ObenCostOrderMockAdapter (simulador de APIConsultaParadixe / Liquidación)', () => {
  const mock = new ObenCostOrderMockAdapter(new StaticScenarioProvider());
  const run = <T>(op: string, args: Record<string, unknown>) => mock.execute<T>(op, args, CTX);

  it('expone exactamente las mismas operaciones que el adapter real (paridad mock ↔ real)', () => {
    const real = new ObenCostOrderRealAdapter({ authToken: 'x' });
    const ops = (a: { capabilities(): Array<{ operation: string }> }) => a.capabilities().map((c) => c.operation).sort();
    expect(ops(mock)).toEqual(ops(real));
  });

  it('spEmpaqueUnificada trae Cliente, País y Proforma (lo que usan Facturación y Liquidación)', async () => {
    const res = await run<Record<string, unknown>>('query.run', { procedure: 'spEmpaqueUnificada_Paradixe', numberOrderSales: 11086 });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('mock');
    expect(res.data).toMatchObject({ Cliente: expect.stringContaining('Demo'), Pais: expect.any(String), Proforma: '11286', OrdenVenta: '11086' });
  });

  it('liquidacion.consultar devuelve la forma real de spCheckSettlement y apunta de vuelta a la misma OV', async () => {
    const empaque = (await run<{ Proforma: string; Cliente: string }>('query.run', { procedure: 'spEmpaqueUnificada_Paradixe', numberOrderSales: 11086 })).data!;
    const check = (await run<Record<string, unknown>>('liquidacion.consultar', { numberPF: empaque.Proforma })).data!;

    expect(check).toMatchObject({ Proforma: '11286', OrdenVenta: '11086', Cliente: empaque.Cliente });
    const detalle = check.Detalle as Array<Record<string, unknown>>;
    expect(detalle.length).toBeGreaterThan(0);
    for (const l of detalle) {
      expect(l).toEqual({
        CodSed_LineFilm: expect.any(Number),
        TipoPelicula: expect.any(String),
        Precio: expect.any(Number),
        KilosTotales: expect.any(Number),
      });
    }
  });

  it('es determinista por orden', async () => {
    const a = await run('liquidacion.consultar', { numberPF: 11286 });
    const b = await run('liquidacion.consultar', { numberPF: '11286' });
    expect(a.data).toEqual(b.data);
  });

  it('crearEncabezado devuelve un CodSec_InvoiceDataComexHead y crearDetalle exige ese id', async () => {
    const head = await run<{ CodSec_InvoiceDataComexHead: number }>('liquidacion.crearEncabezado', { numberPF: 11286 });
    expect(head.data!.CodSec_InvoiceDataComexHead).toBeGreaterThan(0);

    expect((await run('liquidacion.crearDetalle', { codSecInvoiceDataComexHead: head.data!.CodSec_InvoiceDataComexHead })).ok).toBe(true);
    const sinHead = await run('liquidacion.crearDetalle', {});
    expect(sinHead.ok).toBe(false);
    expect(sinHead.error).toMatch(/codSecInvoiceDataComexHead requerido/);
  });

  it.each(['liquidacion.consultar', 'liquidacion.crearEncabezado'])('%s sin numberPF → error de negocio', async (op) => {
    const res = await run(op, {});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/BUSINESS_ERROR: numberPF requerido/);
  });
});
