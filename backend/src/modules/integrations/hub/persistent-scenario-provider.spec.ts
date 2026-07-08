import { PersistentScenarioProvider } from './persistent-scenario-provider';
import { MockScenario } from '../../../entities/mock-scenario.entity';

function makeProvider(row: Partial<MockScenario> | null) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(row),
  };
  return new PersistentScenarioProvider(repo as never);
}

describe('PersistentScenarioProvider', () => {
  it('sin fila devuelve happy_path por default', async () => {
    const p = makeProvider(null);
    const s = await p.resolve('t1', 'oracle', 'gl.getAccounts');
    expect(s.behavior).toBe('happy_path');
  });

  it('mapea la fila a ScenarioConfig', async () => {
    const p = makeProvider({
      behavior: 'business_error',
      errorCode: 'CUFE_REJECTED',
      errorMessage: 'CUFE rechazado',
      latencyMs: 200,
      errorRatio: 0.5,
    } as MockScenario);
    const s = await p.resolve('t1', 'dian', 'invoice.send');
    expect(s.behavior).toBe('business_error');
    expect(s.errorCode).toBe('CUFE_REJECTED');
    expect(s.latencyMs).toBe(200);
    expect(s.errorRatio).toBe(0.5);
  });

  it('cachea el resultado durante TTL', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue({ behavior: 'happy_path' } as MockScenario),
    };
    const p = new PersistentScenarioProvider(repo as never);
    await p.resolve('t1', 'oracle', 'x');
    await p.resolve('t1', 'oracle', 'x');
    await p.resolve('t1', 'oracle', 'x');
    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });

  it('invalidate limpia entrada específica', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const p = new PersistentScenarioProvider(repo as never);
    await p.resolve('t1', 'oracle', 'x');
    p.invalidate('t1', 'oracle', 'x');
    await p.resolve('t1', 'oracle', 'x');
    expect(repo.findOne).toHaveBeenCalledTimes(2);
  });

  it('invalidate por tenant limpia todas', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const p = new PersistentScenarioProvider(repo as never);
    await p.resolve('t1', 'oracle', 'a');
    await p.resolve('t1', 'dian', 'b');
    await p.resolve('t2', 'email', 'c');
    p.invalidate('t1');
    await p.resolve('t1', 'oracle', 'a');
    await p.resolve('t1', 'dian', 'b');
    await p.resolve('t2', 'email', 'c'); // aún cacheada
    // 3 primeras + 2 recargas = 5
    expect(repo.findOne).toHaveBeenCalledTimes(5);
  });
});
