import { AuthorizationService } from './authorization.service';
import { AuthorizationPolicy, AuthorizationRequest } from './authorization.types';

interface QueryStep {
  match: (sql: string, params: unknown[]) => boolean;
  reply: unknown[];
}

function makeDataSource(steps: QueryStep[]) {
  return {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      for (const s of steps) {
        if (s.match(sql, params)) return s.reply;
      }
      return [];
    }),
  } as never;
}

function makeLicenses(enabled: string[] = []) {
  return {
    isModuleEnabled: jest.fn(async (_tenant: string, moduleKey: string) => enabled.includes(moduleKey)),
    resolve: jest.fn(),
  } as never;
}

function makeLicensing(valid = true, reason = 'expired') {
  return {
    validate: jest.fn(async () => (valid ? { valid: true } : { valid: false, reason })),
  } as never;
}

function permRow(perm: string, isPlatform = false): QueryStep {
  return {
    match: (sql, params) =>
      sql.includes('FROM permissions WHERE key = $1') && params[0] === perm,
    reply: [{ is_platform: isPlatform, module_key: perm.split('.')[0] }],
  };
}

function grantTenant(userId: string, tenantId: string, perm: string): QueryStep {
  return {
    match: (sql, params) =>
      sql.includes('FROM user_roles ur') &&
      params[0] === userId &&
      params[1] === tenantId &&
      params[2] === perm,
    reply: [{ 1: 1 }],
  };
}

function grantPlatform(userId: string, perm: string): QueryStep {
  return {
    match: (sql, params) =>
      sql.includes('FROM platform_user_roles pur') &&
      params[0] === userId &&
      params[1] === perm,
    reply: [{ 1: 1 }],
  };
}

describe('AuthorizationService', () => {
  it('permiso no registrado → deny', async () => {
    const svc = new AuthorizationService(
      makeDataSource([]),
      makeLicenses([]),
      makeLicensing(),
    );
    const d = await svc.can({
      subject: { userId: 'u1', tenantId: 't1', isSuperAdmin: false },
      permission: 'nope.action',
    });
    expect(d.effect).toBe('deny');
    expect(d.reason).toBe('permission_not_registered');
  });

  it('permiso de plataforma otorgado → allow', async () => {
    const svc = new AuthorizationService(
      makeDataSource([
        permRow('platform.tenants.read', true),
        grantPlatform('u1', 'platform.tenants.read'),
      ]),
      makeLicenses([]),
      makeLicensing(),
    );
    const d = await svc.can({
      subject: { userId: 'u1', tenantId: null, isSuperAdmin: true },
      permission: 'platform.tenants.read',
    });
    expect(d.effect).toBe('allow');
    expect(d.matchedPolicy).toBe('rbac.platform');
  });

  it('permiso de plataforma sin platform role → deny', async () => {
    const svc = new AuthorizationService(
      makeDataSource([permRow('platform.tenants.manage', true)]),
      makeLicenses([]),
      makeLicensing(),
    );
    const d = await svc.can({
      subject: { userId: 'u1', tenantId: null, isSuperAdmin: false },
      permission: 'platform.tenants.manage',
    });
    expect(d.effect).toBe('deny');
    expect(d.reason).toBe('missing_platform_role');
  });

  it('permiso tenant + módulo no licenciado → deny', async () => {
    const svc = new AuthorizationService(
      makeDataSource([permRow('ia.use')]),
      makeLicenses([]),
      makeLicensing(),
    );
    const d = await svc.can({
      subject: { userId: 'u1', tenantId: 't1', isSuperAdmin: false },
      permission: 'ia.use',
    });
    expect(d.effect).toBe('deny');
    expect(d.reason).toBe('module_not_licensed');
  });

  it('permiso tenant + módulo licenciado + rol con permiso → allow', async () => {
    const svc = new AuthorizationService(
      makeDataSource([
        permRow('clients.read'),
        grantTenant('u1', 't1', 'clients.read'),
      ]),
      makeLicenses(['clients']),
      makeLicensing(),
    );
    const d = await svc.can({
      subject: { userId: 'u1', tenantId: 't1', isSuperAdmin: false },
      permission: 'clients.read',
    });
    expect(d.effect).toBe('allow');
    expect(d.matchedPolicy).toBe('rbac.tenant');
  });

  it('permiso tenant + licencia comercial vencida → deny license_expired', async () => {
    const svc = new AuthorizationService(
      makeDataSource([permRow('clients.read')]),
      makeLicenses(['clients']),
      makeLicensing(false),
    );
    const d = await svc.can({
      subject: { userId: 'u1', tenantId: 't1', isSuperAdmin: false },
      permission: 'clients.read',
    });
    expect(d.effect).toBe('deny');
    expect(d.reason).toBe('license_expired');
  });

  it('sin tenantId y permiso tenant → deny', async () => {
    const svc = new AuthorizationService(
      makeDataSource([permRow('clients.read')]),
      makeLicenses(['clients']),
      makeLicensing(),
    );
    const d = await svc.can({
      subject: { userId: 'u1', tenantId: null, isSuperAdmin: false },
      permission: 'clients.read',
    });
    expect(d.effect).toBe('deny');
    expect(d.reason).toBe('no_tenant_in_subject');
  });

  it('policy pluggable deny gana sobre RBAC allow', async () => {
    const denyPolicy: AuthorizationPolicy = {
      name: 'time-window',
      evaluate: async (_req: AuthorizationRequest) => ({
        effect: 'deny',
        reason: 'outside_working_hours',
      }),
    };
    const svc = new AuthorizationService(
      makeDataSource([
        permRow('orders.approve'),
        grantTenant('u1', 't1', 'orders.approve'),
      ]),
      makeLicenses(['orders']),
      makeLicensing(),
      [denyPolicy],
    );
    const d = await svc.can({
      subject: { userId: 'u1', tenantId: 't1', isSuperAdmin: false },
      permission: 'orders.approve',
    });
    expect(d.effect).toBe('deny');
    expect(d.matchedPolicy).toContain('policy:');
  });
});
