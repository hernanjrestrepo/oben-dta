import { LicensingService } from './licensing.service';
import { LicenseSigningService } from './license-signing.service';
import { License, LicenseStatus } from '../../entities/license.entity';

function makeSigning(): LicenseSigningService {
  const config = { get: jest.fn(() => undefined) };
  const svc = new LicenseSigningService(config as never);
  svc.onModuleInit();
  return svc;
}

function makeRepos() {
  const licenseStore = new Map<string, License>();
  const tenantStore = new Map<
    string,
    { id: string; installationId: string | null }
  >();

  const licenses = {
    findOne: jest.fn(({ where }: { where: { tenantId: string } }) =>
      Promise.resolve(licenseStore.get(where.tenantId) ?? null),
    ),
    create: jest.fn((partial: Partial<License>) => ({ ...partial }) as License),
    save: jest.fn((entity: License) => {
      licenseStore.set(entity.tenantId, entity);
      return Promise.resolve(entity);
    }),
  };

  const tenants = {
    findOne: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(tenantStore.get(where.id) ?? null),
    ),
    save: jest.fn((entity: { id: string; installationId: string | null }) => {
      tenantStore.set(entity.id, entity);
      return Promise.resolve(entity);
    }),
  };

  tenantStore.set('t1', { id: 't1', installationId: null });

  return { licenses, tenants, licenseStore, tenantStore };
}

describe('LicensingService', () => {
  it('issue() genera installationId, firma la licencia y queda válida', async () => {
    const { licenses, tenants } = makeRepos();
    const signing = makeSigning();
    const svc = new LicensingService(
      licenses as never,
      tenants as never,
      signing,
    );

    const license = await svc.issue('t1', {
      planKey: 'starter',
      durationDays: 30,
      maxUsers: 10,
    });
    expect(license.installationId).toBeTruthy();
    expect(license.signature).toBeTruthy();

    const result = await svc.validate('t1');
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('sin licencia emitida → no_license', async () => {
    const { licenses, tenants } = makeRepos();
    const svc = new LicensingService(
      licenses as never,
      tenants as never,
      makeSigning(),
    );
    const result = await svc.validate('t1');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('no_license');
  });

  it('renew() extiende expiresAt y re-firma manteniendo validez', async () => {
    const { licenses, tenants } = makeRepos();
    const svc = new LicensingService(
      licenses as never,
      tenants as never,
      makeSigning(),
    );
    await svc.issue('t1', { planKey: 'starter', durationDays: 1 });

    const renewed = await svc.renew('t1', { durationDays: 60 });
    const result = await svc.validate('t1');
    expect(result.valid).toBe(true);
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 30 * 86_400_000,
    );
  });

  it('manipulación manual de expiresAt en BD invalida la firma (tampered)', async () => {
    const { licenses, tenants, licenseStore } = makeRepos();
    const svc = new LicensingService(
      licenses as never,
      tenants as never,
      makeSigning(),
    );
    await svc.issue('t1', { planKey: 'starter', durationDays: 30 });

    // Simula un UPDATE manual directo en Postgres sobre la fila, sin pasar
    // por el servicio (por lo tanto sin re-firmar).
    const stored = licenseStore.get('t1')!;
    stored.expiresAt = new Date('2099-01-01');
    licenseStore.set('t1', stored);

    const result = await svc.validate('t1');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('tampered');
  });

  it('manipulación manual de maxUsers en BD invalida la firma (tampered)', async () => {
    const { licenses, tenants, licenseStore } = makeRepos();
    const svc = new LicensingService(
      licenses as never,
      tenants as never,
      makeSigning(),
    );
    await svc.issue('t1', {
      planKey: 'starter',
      durationDays: 30,
      maxUsers: 10,
    });

    const stored = licenseStore.get('t1')!;
    stored.maxUsers = 999999;
    licenseStore.set('t1', stored);

    const result = await svc.validate('t1');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('tampered');
  });

  it('licencia vencida dentro del período de gracia → válida con graceActive', async () => {
    const { licenses, tenants } = makeRepos();
    const signing = makeSigning();
    const svc = new LicensingService(
      licenses as never,
      tenants as never,
      signing,
    );
    // durationDays negativo la deja vencida desde ya; gracePeriodDays=7 cubre la ventana.
    await svc.issue('t1', {
      planKey: 'starter',
      durationDays: -1,
      gracePeriodDays: 7,
    });

    const result = await svc.validate('t1');
    expect(result.valid).toBe(true);
    expect(result.graceActive).toBe(true);
    expect(result.renewalDue).toBe(true);
  });

  it('licencia vencida más allá del período de gracia → inválida (expired)', async () => {
    const { licenses, tenants } = makeRepos();
    const svc = new LicensingService(
      licenses as never,
      tenants as never,
      makeSigning(),
    );
    await svc.issue('t1', {
      planKey: 'starter',
      durationDays: -10,
      gracePeriodDays: 2,
    });

    const result = await svc.validate('t1');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('setStatus(SUSPENDED) re-firma y validate() deniega con reason=suspended', async () => {
    const { licenses, tenants } = makeRepos();
    const svc = new LicensingService(
      licenses as never,
      tenants as never,
      makeSigning(),
    );
    await svc.issue('t1', { planKey: 'starter', durationDays: 30 });

    await svc.setStatus('t1', LicenseStatus.SUSPENDED);
    const result = await svc.validate('t1');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('suspended');
  });

  it('setStatus(REVOKED) deniega con reason=revoked', async () => {
    const { licenses, tenants } = makeRepos();
    const svc = new LicensingService(
      licenses as never,
      tenants as never,
      makeSigning(),
    );
    await svc.issue('t1', { planKey: 'starter', durationDays: 30 });

    await svc.setStatus('t1', LicenseStatus.REVOKED);
    const result = await svc.validate('t1');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('revoked');
  });

  it('reissue sobre un tenant ya licenciado reutiliza el mismo licenseId', async () => {
    const { licenses, tenants } = makeRepos();
    const svc = new LicensingService(
      licenses as never,
      tenants as never,
      makeSigning(),
    );
    const first = await svc.issue('t1', {
      planKey: 'starter',
      durationDays: 30,
    });
    const second = await svc.issue('t1', { planKey: 'pro', durationDays: 60 });
    expect(second.id).toBe(first.id);
    expect(second.planKey).toBe('pro');
  });
});
