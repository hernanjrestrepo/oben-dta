import { AdapterRegistry } from './adapter-registry';
import { OracleMockAdapter } from './adapters/oracle.mock';
import { ObenMockAdapter } from './adapters/oben.mock';
import { CubeIQMockAdapter } from './adapters/cubeiq.mock';
import { DianMockAdapter } from './adapters/dian.mock';
import { EFrancoMockAdapter } from './adapters/efranco.mock';
import { ShippingMockAdapter } from './adapters/shipping.mock';
import { EmailMockAdapter } from './adapters/email.mock';
import { WhatsAppMockAdapter } from './adapters/whatsapp.mock';
import { StaticScenarioProvider } from './static-scenario-provider';

function makeRegistry(tenantConfig: Record<string, unknown> = {}) {
  const scenarios = new StaticScenarioProvider();
  const tenantRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 't1',
      integrationConfig: tenantConfig,
    }),
  };
  return new AdapterRegistry(
    tenantRepo as never,
    new OracleMockAdapter(scenarios),
    new ObenMockAdapter(scenarios),
    new CubeIQMockAdapter(scenarios),
    new DianMockAdapter(scenarios),
    new EFrancoMockAdapter(scenarios),
    new ShippingMockAdapter(scenarios),
    new EmailMockAdapter(scenarios),
    new WhatsAppMockAdapter(scenarios),
    scenarios,
  );
}

describe('AdapterRegistry', () => {
  it('sin config → devuelve mock', async () => {
    const registry = makeRegistry();
    const adapter = await registry.resolve('t1', 'oracle');
    expect(adapter.mode).toBe('mock');
    expect(adapter.system).toBe('oracle');
  });

  it('config.mode="mock" explícito → mock', async () => {
    const registry = makeRegistry({ oracle: { mode: 'mock' } });
    const adapter = await registry.resolve('t1', 'oracle');
    expect(adapter.mode).toBe('mock');
  });

  it('config.mode="real" → real adapter (con pending_credentials si falta baseUrl)', async () => {
    const registry = makeRegistry({ oracle: { mode: 'real', authScheme: 'bearer' } });
    const adapter = await registry.resolve('t1', 'oracle');
    expect(adapter.mode).toBe('real');
    const health = await adapter.health();
    expect(health.state).toBe('pending_credentials');
  });

  it('config.mode="real" con baseUrl y api_key → operational (health)', async () => {
    const registry = makeRegistry({
      oben: {
        mode: 'real',
        baseUrl: 'https://mock.local',
        authScheme: 'api_key',
        apiKey: 'k',
        routes: { list: { path: '/x', method: 'GET' } },
      },
    });
    const adapter = await registry.resolve('t1', 'oben');
    expect(adapter.mode).toBe('real');
    const health = await adapter.health();
    expect(health.state).toBe('operational');
  });

  it('listSystems retorna los 8 sistemas', () => {
    const registry = makeRegistry();
    expect(registry.listSystems()).toHaveLength(8);
  });
});
