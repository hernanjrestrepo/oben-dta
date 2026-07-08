import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { AuthorizationDecision } from './authorization.types';

function makeExecCtx(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let ctx: TenantContext;
  let can: jest.Mock<Promise<AuthorizationDecision>, unknown[]>;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    ctx = new TenantContext();
    ctx.setContext('t1', 'u1', false);
    can = jest.fn<Promise<AuthorizationDecision>, unknown[]>();
    guard = new PermissionsGuard(reflector, { can } as never, ctx);
  });

  it('sin metadata → deja pasar (opt-in)', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(null);
    const req = { user: { sub: 'u1', tenantId: 't1', isSuperAdmin: false } };
    await expect(guard.canActivate(makeExecCtx(req))).resolves.toBe(true);
    expect(can).not.toHaveBeenCalled();
  });

  it('con metadata pero sin req.user → forbidden', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      permissions: ['clients.read'],
      mode: 'all',
    });
    await expect(guard.canActivate(makeExecCtx({}))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('modo all: todos los permisos deben ser allow', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      permissions: ['clients.read', 'clients.update'],
      mode: 'all',
    });
    can.mockResolvedValueOnce({ effect: 'allow', reason: 'x' });
    can.mockResolvedValueOnce({ effect: 'deny', reason: 'no_matching_role' });
    const req = { user: { sub: 'u1', tenantId: 't1', isSuperAdmin: false } };
    await expect(guard.canActivate(makeExecCtx(req))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('modo any: basta uno allow', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      permissions: ['clients.read', 'orders.approve'],
      mode: 'any',
    });
    can.mockResolvedValueOnce({ effect: 'deny', reason: 'x' });
    can.mockResolvedValueOnce({ effect: 'allow', reason: 'y' });
    const req = { user: { sub: 'u1', tenantId: 't1', isSuperAdmin: false } };
    await expect(guard.canActivate(makeExecCtx(req))).resolves.toBe(true);
  });

  it('modo any: si todos deny → forbidden', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      permissions: ['a.b', 'c.d'],
      mode: 'any',
    });
    can.mockResolvedValue({ effect: 'deny', reason: 'nope' });
    const req = { user: { sub: 'u1', tenantId: 't1', isSuperAdmin: false } };
    await expect(guard.canActivate(makeExecCtx(req))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
