import { StaticScenarioProvider } from '../integrations/hub/static-scenario-provider';
import { ObenCostOrderMockAdapter } from '../integrations/hub/adapters/oben-cost-order.mock';
import { ObenPlusMockAdapter } from '../integrations/hub/adapters/oben-plus.mock';
import { DianMockAdapter } from '../integrations/hub/adapters/dian.mock';
import { EmailMockAdapter } from '../integrations/hub/adapters/email.mock';
import type { IntegrationAdapter } from '../integrations/hub/adapter.types';
import { ComercialService } from './comercial.service';
import { LiquidacionService } from '../liquidacion/liquidacion.service';
import { SimulatedIncotermCalculator } from '../liquidacion/liquidacion-value-calculator';
import { FacturacionService } from '../facturacion/facturacion.service';
import { FacturacionPdfService } from '../facturacion/facturacion-pdf.service';

/**
 * Flujo Comercial → Liquidación → Facturación de punta a punta en MODO
 * SIMULADO, con los simuladores reales del Integration Hub (no dobles ad
 * hoc): obenCostOrder (datos del pedido), obenPlus (Proforma), dian (CUFE) y
 * email. Demuestra que hoy todo el pipeline corre, que cada dato simulado
 * queda marcado, y que los candados impiden que algo simulado llegue a un
 * sistema real.
 */
const CTX = { tenantId: 't1', userId: 'u1' };

class FakeIdempotency {
  rows = new Map<string, { status: 'processing' | 'completed' | 'failed'; result?: unknown }>();
  async claim(_t: string, _e: string, key: string) {
    const ex = this.rows.get(key);
    if (ex) return { claimed: false, existingStatus: ex.status, existingResult: ex.result };
    this.rows.set(key, { status: 'processing' });
    return { claimed: true };
  }
  async saveProgress(_t: string, key: string, result: unknown) {
    this.rows.get(key)!.result = result;
  }
  async markCompleted(_t: string, key: string, result: unknown) {
    Object.assign(this.rows.get(key)!, { status: 'completed', result });
  }
  async markFailed(_t: string, key: string) {
    this.rows.get(key)!.status = 'failed';
  }
  async reclaimFailed() {
    return false;
  }
  async reclaimStale() {
    return false;
  }
}

function pipeline(opts: { dianMode?: 'mock' | 'real' } = {}) {
  const sc = new StaticScenarioProvider();
  const adapters: Record<string, IntegrationAdapter> = {
    obenCostOrder: new ObenCostOrderMockAdapter(sc),
    obenPlus: new ObenPlusMockAdapter(sc),
    dian: new DianMockAdapter(sc),
    email: new EmailMockAdapter(sc),
  };
  const calls: Array<{ system: string; op: string }> = [];
  const hub = {
    call: async (system: string, op: string, args: Record<string, unknown>) => {
      calls.push({ system, op });
      return adapters[system].execute(op, args, CTX);
    },
    capabilities: async (system: string) => ({
      system,
      mode: system === 'dian' && opts.dianMode ? opts.dianMode : adapters[system].mode,
      capabilities: adapters[system].capabilities(),
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined), listForEntity: jest.fn().mockResolvedValue([]) };
  const idempotency = new FakeIdempotency();
  const rates = {
    resolveSurcharges: jest.fn().mockResolvedValue({ entryFee: 110, importerSecurityFiling: 20, harborMaintenanceFee: 4.73, destinationCharges: null, missing: [] }),
  };
  const ctx = { tenantId: 't1', userId: 'u1' };
  return {
    calls,
    idempotency,
    comercial: new ComercialService(hub as never),
    liquidacion: new LiquidacionService(hub as never, ctx as never, audit as never, idempotency as never, rates as never, new SimulatedIncotermCalculator()),
    facturacion: new FacturacionService(
      hub as never,
      ctx as never,
      audit as never,
      { resolveRecipients: jest.fn().mockResolvedValue({ to: ['comex@oben.com'], cc: [], bcc: [] }) } as never,
      new FacturacionPdfService(),
      { find: jest.fn().mockResolvedValue([]) } as never,
      idempotency as never,
    ),
    empaque: async (ov: number) =>
      (await adapters.obenCostOrder.execute<{ Pais: string; Proforma: string }>('query.run', { procedure: 'spEmpaqueUnificada_Paradixe', numberOrderSales: ov }, CTX)).data!,
  };
}

/** Primera OV del simulador cuyo destino cumple el filtro (determinista). */
async function findOrder(p: ReturnType<typeof pipeline>, match: (pais: string) => boolean) {
  for (let ov = 11000; ov < 11200; ov++) {
    const e = await p.empaque(ov);
    if (match(e.Pais)) return { ov, pf: e.Proforma, pais: e.Pais };
  }
  throw new Error('el simulador no generó una OV con ese destino');
}

const HEADER = { direccion: 'Bodega demo', puertoArribo: 'Guayaquil', puertoEmbarque: 'Cartagena', paNcm: '3920.20', paNaladi: '3920.20.00' };

describe('Pipeline Comercial → Liquidación → Facturación en MODO SIMULADO', () => {
  it('exportación (no USA): seguimiento, liquidación simulada y factura con CUFE simulado — todo marcado', async () => {
    const p = pipeline();
    const { ov, pf } = await findOrder(p, (pais) => pais !== 'COLOMBIA' && pais !== 'USA');

    const tracking = await p.comercial.getProforma(pf);
    expect(tracking).toMatchObject({ numberPF: pf, simulated: true, missing: [] });

    const liq = await p.liquidacion.getDraft(pf, { header: HEADER });
    expect(liq).toMatchObject({ readyToSubmit: true, simulated: true, ordenVenta: String(ov) });
    const dryRun = await p.liquidacion.submit(pf, { header: HEADER });
    expect(dryRun).toMatchObject({ dryRun: true, simulated: true });

    const draft = await p.facturacion.getDraft(ov);
    expect(draft).toMatchObject({ kind: 'exportacion', direccionFuente: 'oben_plus', readyToGenerate: true, simulated: true });
    expect(draft.simulatedFields.sort()).toEqual(['direccionEntrega', 'pedido', 'precios']);

    const sent = await p.facturacion.send(ov);
    expect(sent).toMatchObject({ sent: true, cufeSimulado: true, simulated: true });
    expect(sent.cufe).toMatch(/^[0-9a-f]{64}$/);
  });

  it('candado de Liquidación: con la fórmula simulada, confirm:true nunca llega a crear nada en Oben', async () => {
    const p = pipeline();
    const { pf } = await findOrder(p, (pais) => pais !== 'COLOMBIA' && pais !== 'USA');

    await expect(p.liquidacion.submit(pf, { header: HEADER }, { confirm: true })).rejects.toThrow(/SIMULADA/);

    expect(p.calls.filter((c) => c.op.startsWith('liquidacion.crear'))).toEqual([]);
    expect(p.idempotency.rows.size).toBe(0);
  });

  it('candado de Facturación: con un proveedor DIAN real, los datos simulados nunca se emiten', async () => {
    const p = pipeline({ dianMode: 'real' });
    const { ov } = await findOrder(p, (pais) => pais !== 'COLOMBIA');

    await expect(p.facturacion.send(ov)).rejects.toThrow(/datos SIMULADOS/);

    expect(p.calls.filter((c) => c.system === 'dian' || c.system === 'email')).toEqual([]);
  });

  it('nacional (Colombia): no pide dirección a Oben+ y también se factura con CUFE simulado', async () => {
    const p = pipeline();
    const { ov } = await findOrder(p, (pais) => pais === 'COLOMBIA');

    const draft = await p.facturacion.getDraft(ov);
    expect(draft).toMatchObject({ kind: 'nacional_completo', readyToGenerate: true, direccionFuente: null });
    expect(p.calls.some((c) => c.system === 'obenPlus')).toBe(false);

    await expect(p.facturacion.send(ov)).resolves.toMatchObject({ cufeSimulado: true });
  });

  it('el tablero Comercial agrega el catálogo simulado y lo declara', async () => {
    const d = await pipeline().comercial.dashboard();
    expect(d.simulated).toBe(true);
    expect(d.totales.total).toBeGreaterThan(0);
  });
});
