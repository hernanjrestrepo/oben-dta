import { LicenseService } from './license.service';
import { SubscriptionStatus } from '../../entities/tenant-subscription.entity';

function repo(defaultResults: unknown = []) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue(defaultResults),
  };
}

function makeService(overrides?: {
  sub?: unknown;
  planModules?: string[];
  flags?: Array<{ moduleKey: string; enabled: boolean }>;
}) {
  const subs = repo();
  const pm = repo(
    (overrides?.planModules ?? []).map((moduleKey) => ({ moduleKey, planId: 'p1' })),
  );
  const flags = repo(overrides?.flags ?? []);

  if (overrides?.sub) subs.findOne.mockResolvedValue(overrides.sub);

  return new LicenseService(
    subs as never,
    pm as never,
    flags as never,
  );
}

describe('LicenseService', () => {
  it('sin suscripción → ningún módulo habilitado', async () => {
    const svc = makeService();
    const res = await svc.resolve('t1');
    expect([...res.modulesEnabled]).toEqual([]);
    expect(res.planKey).toBeNull();
    expect(res.subscriptionStatus).toBeNull();
  });

  it('suscripción cancelled → ningún módulo habilitado', async () => {
    const svc = makeService({
      sub: {
        id: 's1',
        tenantId: 't1',
        planId: 'p1',
        plan: { key: 'pro' },
        status: SubscriptionStatus.CANCELLED,
      },
      planModules: ['clients', 'orders'],
    });
    const res = await svc.resolve('t1');
    expect([...res.modulesEnabled]).toEqual([]);
    expect(res.planKey).toBe('pro');
  });

  it('suscripción activa habilita módulos del plan', async () => {
    const svc = makeService({
      sub: {
        id: 's1',
        tenantId: 't1',
        planId: 'p1',
        plan: { key: 'starter' },
        status: SubscriptionStatus.ACTIVE,
      },
      planModules: ['clients', 'orders'],
    });
    const res = await svc.resolve('t1');
    expect([...res.modulesEnabled].sort()).toEqual(['clients', 'orders']);
  });

  it('feature flag enabled=true suma módulo aunque no esté en el plan', async () => {
    const svc = makeService({
      sub: {
        id: 's1',
        tenantId: 't1',
        planId: 'p1',
        plan: { key: 'starter' },
        status: SubscriptionStatus.ACTIVE,
      },
      planModules: ['clients'],
      flags: [{ moduleKey: 'ia', enabled: true }],
    });
    const res = await svc.resolve('t1');
    expect([...res.modulesEnabled].sort()).toEqual(['clients', 'ia']);
  });

  it('feature flag enabled=false quita módulo aunque esté en el plan', async () => {
    const svc = makeService({
      sub: {
        id: 's1',
        tenantId: 't1',
        planId: 'p1',
        plan: { key: 'pro' },
        status: SubscriptionStatus.ACTIVE,
      },
      planModules: ['clients', 'orders', 'ia'],
      flags: [{ moduleKey: 'ia', enabled: false }],
    });
    const res = await svc.resolve('t1');
    expect([...res.modulesEnabled].sort()).toEqual(['clients', 'orders']);
  });

  it('isModuleEnabled delega correctamente', async () => {
    const svc = makeService({
      sub: {
        id: 's1',
        tenantId: 't1',
        planId: 'p1',
        plan: { key: 'pro' },
        status: SubscriptionStatus.ACTIVE,
      },
      planModules: ['clients'],
    });
    expect(await svc.isModuleEnabled('t1', 'clients')).toBe(true);
    expect(await svc.isModuleEnabled('t1', 'ia')).toBe(false);
  });
});
