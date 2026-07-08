import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MockScenariosService } from './mock-scenarios.service';
import { TenantContext } from '../../../common/tenant/tenant-context.service';
import { PersistentScenarioProvider } from './persistent-scenario-provider';

function makeService(setup: { existing?: unknown } = {}) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(setup.existing ?? null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((partial) => partial),
    save: jest.fn(async (e) => e),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const ctx = new TenantContext();
  ctx.setContext('t1', 'actor', false);
  const cache = { invalidate: jest.fn() } as unknown as PersistentScenarioProvider;
  const svc = new MockScenariosService(repo as never, ctx, cache);
  return { svc, repo, cache };
}

describe('MockScenariosService', () => {
  it('rechaza system inválido', async () => {
    const { svc } = makeService();
    await expect(
      svc.upsert({ system: 'inexistente' as never, operation: 'x', behavior: 'happy_path' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza behavior inválido', async () => {
    const { svc } = makeService();
    await expect(
      svc.upsert({ system: 'oracle', operation: 'x', behavior: 'nope' as never }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza errorRatio fuera de [0,1]', async () => {
    const { svc } = makeService();
    await expect(
      svc.upsert({
        system: 'oracle',
        operation: 'x',
        behavior: 'network_error',
        errorRatio: 1.5,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('upsert crea nuevo escenario e invalida caché', async () => {
    const { svc, cache } = makeService();
    const saved = await svc.upsert({
      system: 'dian',
      operation: 'invoice.send',
      behavior: 'business_error',
      errorCode: 'CUFE_REJECTED',
    });
    expect(saved.behavior).toBe('business_error');
    expect(cache.invalidate).toHaveBeenCalledWith('t1', 'dian', 'invoice.send');
  });

  it('upsert actualiza escenario existente', async () => {
    const existing = {
      id: 's1', tenantId: 't1', system: 'shipping', operation: 'tracking.get',
      behavior: 'latency', latencyMs: 500,
    };
    const { svc } = makeService({ existing });
    const saved = await svc.upsert({
      system: 'shipping',
      operation: 'tracking.get',
      behavior: 'timeout',
      latencyMs: 30000,
    });
    expect(saved.behavior).toBe('timeout');
    expect(saved.latencyMs).toBe(30000);
  });

  it('remove sin fila lanza NotFound', async () => {
    const { svc, repo } = makeService();
    (repo.delete as jest.Mock).mockResolvedValueOnce({ affected: 0 });
    await expect(svc.remove('oracle', 'x')).rejects.toThrow(NotFoundException);
  });

  it('resetAll invalida caché de tenant y devuelve deleted', async () => {
    const { svc, cache, repo } = makeService();
    (repo.delete as jest.Mock).mockResolvedValueOnce({ affected: 3 });
    const r = await svc.resetAll();
    expect(r).toEqual({ deleted: 3 });
    expect(cache.invalidate).toHaveBeenCalledWith('t1');
  });

  it('behaviors expone los 10 tipos válidos', () => {
    const { svc } = makeService();
    expect(svc.behaviors()).toHaveLength(10);
  });
});
