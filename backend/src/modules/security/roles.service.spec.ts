import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';

function makeService(setup: {
  existingRole?: unknown;
  matchingPerms?: string[];
  createdSaves?: unknown[];
} = {}) {
  const roles = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(setup.existingRole ?? null),
    create: jest.fn((partial) => partial),
    save: jest.fn(async (entity) => entity),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const perms = {
    find: jest
      .fn()
      .mockResolvedValue(
        (setup.matchingPerms ?? []).map((key) => ({ id: key, key, isPlatform: false })),
      ),
  };
  const userRoles = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((partial) => partial),
    save: jest.fn(async (entity) => entity),
    delete: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  };
  const users = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 'u1', tenantId: 't1' }),
  };

  const ctx = new TenantContext();
  ctx.setContext('t1', 'actor', false);

  const svc = new RolesService(
    roles as never,
    perms as never,
    userRoles as never,
    users as never,
    ctx,
  );

  return { svc, roles, perms, userRoles, users };
}

describe('RolesService', () => {
  it('createRole falla si un permiso no existe', async () => {
    const { svc } = makeService({ matchingPerms: ['clients.read'] });
    await expect(
      svc.createRole({
        key: 'x',
        name: 'X',
        permissions: ['clients.read', 'inexistente.perm'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('createRole persiste con permisos válidos', async () => {
    const setup = makeService({ matchingPerms: ['clients.read', 'clients.create'] });
    const created = await setup.svc.createRole({
      key: 'op',
      name: 'Operations',
      permissions: ['clients.read', 'clients.create'],
    });
    expect(created.key).toBe('op');
    expect(created.permissions).toHaveLength(2);
    expect(setup.roles.save).toHaveBeenCalled();
  });

  it('createRole rechaza duplicado', async () => {
    const setup = makeService({ existingRole: { id: 'r1', key: 'op' } });
    await expect(
      setup.svc.createRole({ key: 'op', name: 'Op', permissions: [] }),
    ).rejects.toThrow();
  });

  it('deleteRole falla si es rol de sistema', async () => {
    const setup = makeService({
      existingRole: { id: 'r1', tenantId: 't1', key: 'tenant.admin', isSystem: true },
    });
    await expect(setup.svc.deleteRole('tenant.admin')).rejects.toThrow(ForbiddenException);
  });

  it('getRoleByKey lanza NotFound', async () => {
    const setup = makeService();
    await expect(setup.svc.getRoleByKey('x')).rejects.toThrow(NotFoundException);
  });

  it('assignRole crea la asignación', async () => {
    const setup = makeService({
      existingRole: {
        id: 'r1',
        tenantId: 't1',
        key: 'tenant.admin',
        isSystem: true,
        permissions: [],
      },
    });
    const assigned = await setup.svc.assignRole(
      { userId: 'u1', roleKey: 'tenant.admin' },
      'actor',
    );
    expect(assigned.userId).toBe('u1');
    expect(assigned.roleId).toBe('r1');
    expect(assigned.assignedBy).toBe('actor');
  });
});
