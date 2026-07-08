import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { of } from 'rxjs';
import { TenantContext } from './tenant-context.service';
import { TenantInterceptor } from './tenant.interceptor';

function makeExecCtx(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

const nextHandler = { handle: () => of('ok') };

describe('TenantInterceptor', () => {
  let ctx: TenantContext;
  let interceptor: TenantInterceptor;

  beforeEach(() => {
    ctx = new TenantContext();
    interceptor = new TenantInterceptor(ctx);
  });

  it('deja pasar rutas públicas sin resolver tenant', (done) => {
    const req = { path: '/health', headers: {} };
    interceptor.intercept(makeExecCtx(req), nextHandler).subscribe(() => {
      expect(ctx.hasTenant()).toBe(false);
      expect(ctx.isSuperAdmin).toBe(false);
      done();
    });
  });

  it('deja pasar rutas protegidas sin req.user (guard no montado) sin resolver tenant', (done) => {
    const req = { path: '/clients', headers: {} };
    interceptor.intercept(makeExecCtx(req), nextHandler).subscribe(() => {
      expect(ctx.hasTenant()).toBe(false);
      done();
    });
  });

  it('resuelve tenantId desde JWT en req.user', (done) => {
    const req = {
      path: '/clients',
      headers: {},
      user: { sub: 'user-1', tenantId: 'tenant-a', isSuperAdmin: false },
    };
    interceptor.intercept(makeExecCtx(req), nextHandler).subscribe(() => {
      expect(ctx.tenantId).toBe('tenant-a');
      expect(ctx.userId).toBe('user-1');
      expect(ctx.isSuperAdmin).toBe(false);
      done();
    });
  });

  it('rechaza usuario autenticado sin tenantId (no super admin)', () => {
    const req = {
      path: '/clients',
      headers: {},
      user: { sub: 'user-2', tenantId: null, isSuperAdmin: false },
    };
    expect(() =>
      interceptor.intercept(makeExecCtx(req), nextHandler).subscribe(),
    ).toThrow(UnauthorizedException);
  });

  it('superadmin puede impersonar tenant vía header X-Tenant-Id', (done) => {
    const req = {
      path: '/clients',
      headers: { 'x-tenant-id': 'tenant-impersonated' },
      user: { sub: 'user-super', tenantId: null, isSuperAdmin: true },
    };
    interceptor.intercept(makeExecCtx(req), nextHandler).subscribe(() => {
      expect(ctx.tenantId).toBe('tenant-impersonated');
      expect(ctx.isSuperAdmin).toBe(true);
      done();
    });
  });
});
