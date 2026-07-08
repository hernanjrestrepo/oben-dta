import { StaticScenarioProvider } from '../hub/static-scenario-provider';
import { OracleMockAdapter } from './adapters/oracle.mock';
import { ObenMockAdapter } from './adapters/oben.mock';
import { CubeIQMockAdapter } from './adapters/cubeiq.mock';
import { DianMockAdapter } from './adapters/dian.mock';
import { EFrancoMockAdapter } from './adapters/efranco.mock';
import { ShippingMockAdapter } from './adapters/shipping.mock';
import { EmailMockAdapter } from './adapters/email.mock';
import { WhatsAppMockAdapter } from './adapters/whatsapp.mock';
import { AdapterCallContext, IntegrationAdapter } from './adapter.types';

const CTX: AdapterCallContext = { tenantId: 't1', userId: 'u1' };

function scenarios() {
  return new StaticScenarioProvider();
}

describe('Mock adapters — happy path', () => {
  const cases: Array<[string, IntegrationAdapter, string, Record<string, unknown>]> = [
    ['oracle.gl.getAccounts', new OracleMockAdapter(scenarios()), 'gl.getAccounts', {}],
    ['oben.products.list', new ObenMockAdapter(scenarios()), 'products.list', {}],
    ['cubeiq.plan.optimize', new CubeIQMockAdapter(scenarios()), 'plan.optimize', {
      items: [{ sku: 'A', qty: 10, volumeCm3: 1000, weightGr: 100 }],
    }],
    ['dian.invoice.send', new DianMockAdapter(scenarios()), 'invoice.send', {
      invoiceNumber: 'INV-1', totalAmount: 100000,
    }],
    ['efranco.quote.request', new EFrancoMockAdapter(scenarios()), 'quote.request', {
      origin: 'CO', destination: 'US', grossWeightKg: 500,
    }],
    ['shipping.rate.get', new ShippingMockAdapter(scenarios()), 'rate.get', { weightKg: 10 }],
    ['email.send', new EmailMockAdapter(scenarios()), 'send', {
      to: 'x@y.com', subject: 's', body: 'b',
    }],
    ['whatsapp.send.text', new WhatsAppMockAdapter(scenarios()), 'send.text', {
      to: '+57300', text: 'hola',
    }],
  ];

  it.each(cases)('%s → ok', async (_name, adapter, op, args) => {
    const res = await adapter.execute(op, args, CTX);
    expect(res.ok).toBe(true);
    expect(res.state).toBe('operational');
    expect(res.mode).toBe('mock');
    expect(res.data).toBeDefined();
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('Mock adapter — errores de negocio', () => {
  it('oracle.postJournal desbalanceado → error', async () => {
    const adapter = new OracleMockAdapter(scenarios());
    const res = await adapter.execute(
      'gl.postJournal',
      { lines: [{ account: '1105', debit: 100 }, { account: '4135', credit: 50 }] },
      CTX,
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no balanceado/);
  });

  it('operación desconocida → error', async () => {
    const adapter = new EmailMockAdapter(scenarios());
    const res = await adapter.execute('does.not.exist', {}, CTX);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no soportada/);
  });

  it('email outbox se acumula por tenant y se puede limpiar', async () => {
    const adapter = new EmailMockAdapter(scenarios());
    await adapter.execute('send', { to: 'a@b', subject: 's', body: 'b' }, CTX);
    await adapter.execute('send', { to: 'c@d', subject: 's', body: 'b' }, CTX);
    const list = await adapter.execute<{ messages: unknown[] }>('outbox.list', {}, CTX);
    expect(list.data?.messages).toHaveLength(2);
    const cleared = await adapter.execute<{ cleared: number }>('outbox.clear', {}, CTX);
    expect(cleared.data?.cleared).toBe(2);
  });

  it('shipping.tracking.get es determinista por tracking id', async () => {
    const adapter = new ShippingMockAdapter(scenarios());
    const r1 = await adapter.execute<{ status: string }>('tracking.get', { tracking: 'DHL55' }, CTX);
    const r2 = await adapter.execute<{ status: string }>('tracking.get', { tracking: 'DHL55' }, CTX);
    expect(r1.data?.status).toBe(r2.data?.status);
  });
});

describe('Mock adapter — health', () => {
  it('siempre operational en happy_path', async () => {
    const adapter = new DianMockAdapter(scenarios());
    const health = await adapter.health();
    expect(health.state).toBe('operational');
    expect(health.mode).toBe('mock');
  });
});
