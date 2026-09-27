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
    // Timers falsos: el `sleep(2000)` del escenario de latencia NO se puede
    // cancelar (una promesa de JS no se cancela) y antes seguía armado ~1.9 s
    // después de terminar el test — si este archivo era de los últimos de su
    // worker, Jest no podía cerrarlo ("A worker process has failed to exit
    // gracefully", intermitente). Ahora se drena dentro del propio test.
    jest.useFakeTimers();
    try {
      const scenarios = fakeScenarioProvider(() => ({ behavior: 'latency', latencyMs: 2000 }));
      const adapter = new EmailMockAdapter(scenarios);
      const inFlight: Array<Promise<unknown>> = [];
      const execute = adapter.execute.bind(adapter);
      jest.spyOn(adapter, 'execute').mockImplementation((...args: Parameters<typeof execute>) => {
        const call = execute(...args);
        inFlight.push(call);
        return call;
      });
      const { executor } = makeExecutor();

      const pending = executor.execute(
        adapter, 'send', { to: 'a@b.com', subject: 'x' }, CTX,
        { maxAttempts: 1, timeoutMs: 100 },
      );
      await jest.advanceTimersByTimeAsync(100);
      const result = await pending;

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/timeout/);
      // Respondió a los 100 ms: la latencia simulada de 2000 ms sigue pendiente.
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      await jest.advanceTimersByTimeAsync(2000);
      await Promise.all(inFlight);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
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
