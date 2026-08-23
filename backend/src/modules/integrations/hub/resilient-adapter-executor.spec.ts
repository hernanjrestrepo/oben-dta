import { ResilientAdapterExecutor } from './resilient-adapter-executor';
import { EmailMockAdapter } from './adapters/email.mock';
import { ScenarioConfig, ScenarioProvider } from './scenario.types';

const CTX = { tenantId: 't1', userId: 'u1' };

function fakeScenarioProvider(resolve: () => Promise<ScenarioConfig> | ScenarioConfig): ScenarioProvider {
  return { resolve: async () => resolve() } as ScenarioProvider;
}

function makeExecutor() {
  const saved: unknown[] = [];
  const deadLetters = {
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockImplementation((v) => {
      saved.push(v);
      return Promise.resolve(v);
    }),
  };
  const executor = new ResilientAdapterExecutor(deadLetters as never);
  return { executor, deadLetters, saved };
}

describe('ResilientAdapterExecutor', () => {
  it('reintenta una falla transitoria (network_error) y termina en éxito', async () => {
    let calls = 0;
    const scenarios = fakeScenarioProvider(() => {
      calls += 1;
      return calls < 3 ? { behavior: 'network_error' } : { behavior: 'happy_path' };
    });
    const adapter = new EmailMockAdapter(scenarios);
    const { executor } = makeExecutor();

    const result = await executor.execute(
      adapter,
      'send',
      { to: 'a@b.com', subject: 'hola' },
      CTX,
      { maxAttempts: 5, baseDelayMs: 1 },
    );

    expect(result.ok).toBe(true);
    expect(calls).toBe(3); // 2 fallas transitorias + 1 éxito
  });

  it('agota los reintentos, abre el circuito tras el umbral, y registra dead letter', async () => {
    const scenarios = fakeScenarioProvider(() => ({ behavior: 'network_error' }));
    const adapter = new EmailMockAdapter(scenarios);
    const { executor, deadLetters } = makeExecutor();

    const options = { maxAttempts: 2, baseDelayMs: 1, circuitThreshold: 3, circuitCooldownMs: 60_000 };
    for (let i = 0; i < 3; i++) {
      const r = await executor.execute(adapter, 'send', { to: 'a@b.com', subject: 'x' }, CTX, options);
      expect(r.ok).toBe(false);
    }
    expect(deadLetters.save).toHaveBeenCalledTimes(3);

    // Cuarto intento: el circuito ya debe estar abierto -> ni siquiera llama al adapter.
    const executeSpy = jest.spyOn(adapter, 'execute');
    const blocked = await executor.execute(adapter, 'send', { to: 'a@b.com', subject: 'x' }, CTX, options);
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/circuit_open/);
    expect(executeSpy).not.toHaveBeenCalled();

    const status = executor.getCircuitStatus();
    expect(status.find((c) => c.key === 't1:email')?.open).toBe(true);
  });

  it('un error de negocio (BUSINESS_ERROR) NO se reintenta', async () => {
    const scenarios = fakeScenarioProvider(() => ({ behavior: 'business_error', errorMessage: 'crédito insuficiente' }));
    const adapter = new EmailMockAdapter(scenarios);
    const executeSpy = jest.spyOn(adapter, 'execute');
    const { executor, deadLetters } = makeExecutor();

    const result = await executor.execute(
      adapter, 'send', { to: 'a@b.com', subject: 'x' }, CTX,
      { maxAttempts: 5, baseDelayMs: 1 },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/BUSINESS_ERROR/);
    expect(executeSpy).toHaveBeenCalledTimes(1); // un solo intento, no 5
    expect(deadLetters.save).not.toHaveBeenCalled(); // no es una falla de infraestructura
  });

  it('respeta el timeout configurado sin esperar toda la latencia simulada', async () => {
    const scenarios = fakeScenarioProvider(() => ({ behavior: 'latency', latencyMs: 2000 }));
    const adapter = new EmailMockAdapter(scenarios);
    const { executor } = makeExecutor();

    const started = Date.now();
    const result = await executor.execute(
      adapter, 'send', { to: 'a@b.com', subject: 'x' }, CTX,
      { maxAttempts: 1, timeoutMs: 100 },
    );
    const elapsed = Date.now() - started;

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout/);
    expect(elapsed).toBeLessThan(1000); // muy por debajo de los 2000ms simulados
  });

  it('circuito medio-abierto: tras el cooldown, deja pasar un intento de prueba', async () => {
    const scenarios = fakeScenarioProvider(() => ({ behavior: 'network_error' }));
    const adapter = new EmailMockAdapter(scenarios);
    const { executor } = makeExecutor();
    const options = { maxAttempts: 1, baseDelayMs: 1, circuitThreshold: 1, circuitCooldownMs: 50 };

    await executor.execute(adapter, 'send', { to: 'a@b.com', subject: 'x' }, CTX, options);
    const blocked = await executor.execute(adapter, 'send', { to: 'a@b.com', subject: 'x' }, CTX, options);
    expect(blocked.error).toMatch(/circuit_open/);

    await new Promise((r) => setTimeout(r, 60)); // esperar a que venza el cooldown
    const executeSpy = jest.spyOn(adapter, 'execute');
    await executor.execute(adapter, 'send', { to: 'a@b.com', subject: 'x' }, CTX, options);
    expect(executeSpy).toHaveBeenCalled(); // half-open: sí llegó a llamar al adapter
  });
});
