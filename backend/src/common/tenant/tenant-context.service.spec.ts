import { TenantContext } from './tenant-context.service';

describe('TenantContext', () => {
  it('lanza si se lee tenantId antes de setContext', () => {
    const ctx = new TenantContext();
    expect(() => ctx.tenantId).toThrow(
      'TenantContext: tenantId no está resuelto. Toda ruta autenticada debe pasar por TenantInterceptor.',
    );
  });

  it('devuelve tenantId cuando fue seteado por el interceptor', () => {
    const ctx = new TenantContext();
    ctx.setContext('tenant-a', 'user-1');
    expect(ctx.tenantId).toBe('tenant-a');
    expect(ctx.userId).toBe('user-1');
    expect(ctx.isSuperAdmin).toBe(false);
    expect(ctx.hasTenant()).toBe(true);
  });

  it('permite superadmin sin tenant explícito', () => {
    const ctx = new TenantContext();
    ctx.setContext(null, 'user-super', true);
    expect(ctx.isSuperAdmin).toBe(true);
    expect(ctx.tenantIdOrNull).toBeNull();
    expect(ctx.hasTenant()).toBe(false);
    // Lectura del getter fuerte sí lanza cuando no hay tenant impersonado
    // (superadmin puede impersonar; sin impersonación no puede escribir en tabla tenant-scoped).
    expect(() => ctx.tenantId).not.toThrow();
  });

  it('superadmin con tenant impersonado retorna ese tenantId', () => {
    const ctx = new TenantContext();
    ctx.setContext('tenant-impersonated', 'user-super', true);
    expect(ctx.tenantId).toBe('tenant-impersonated');
    expect(ctx.isSuperAdmin).toBe(true);
  });
});
