import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { TenantStatus } from '../../entities/tenant.entity';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'test@oben.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'sales',
    tenantId: 't1',
    isSuperAdmin: false,
    isActive: true,
    passwordHash: bcrypt.hashSync('CorrectPass123!', 4),
    failedLoginAttempts: 0,
    lockedUntil: null as Date | null,
    tokenVersion: 0,
    ...overrides,
  };
}

function makeRepos(user: ReturnType<typeof makeUser> | null) {
  const store = { current: user };
  const users = {
    findOne: jest.fn(async () => store.current),
    save: jest.fn(async (entity: ReturnType<typeof makeUser>) => {
      store.current = entity;
      return entity;
    }),
    create: jest.fn((partial) => partial),
  };
  const tenants = {
    findOne: jest.fn(async () => ({ id: 't1', slug: 'oben', status: TenantStatus.ACTIVE })),
  };
  return { users, tenants, store };
}

function makeJwt() {
  let counter = 0;
  const issued = new Map<string, Record<string, unknown>>();
  return {
    sign: jest.fn((payload: Record<string, unknown>) => {
      const token = `token-${++counter}`;
      issued.set(token, payload);
      return token;
    }),
    verifyAsync: jest.fn(async (token: string) => {
      const payload = issued.get(token);
      if (!payload) throw new Error('invalid token');
      return payload;
    }),
  };
}

describe('AuthService', () => {
  it('login exitoso resetea intentos fallidos previos', async () => {
    const { users, tenants } = makeRepos(makeUser({ failedLoginAttempts: 3 }));
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never);
    const res = await svc.login({ email: 'test@oben.com', password: 'CorrectPass123!', tenantSlug: 'oben' });
    expect(res.access_token).toBeTruthy();
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }));
  });

  it('password incorrecta incrementa failedLoginAttempts', async () => {
    const { users, tenants } = makeRepos(makeUser());
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never);
    await expect(
      svc.login({ email: 'test@oben.com', password: 'wrong', tenantSlug: 'oben' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ failedLoginAttempts: 1 }));
  });

  it('el 5º intento fallido bloquea la cuenta temporalmente', async () => {
    const { users, tenants } = makeRepos(makeUser({ failedLoginAttempts: 4 }));
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never);
    await expect(
      svc.login({ email: 'test@oben.com', password: 'wrong', tenantSlug: 'oben' }),
    ).rejects.toThrow(UnauthorizedException);
    const saved = users.save.mock.calls[0][0];
    expect(saved.failedLoginAttempts).toBe(0);
    expect(saved.lockedUntil).toBeInstanceOf(Date);
    expect((saved.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('cuenta bloqueada rechaza incluso la contraseña correcta', async () => {
    const { users, tenants } = makeRepos(makeUser({ lockedUntil: new Date(Date.now() + 60_000) }));
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never);
    await expect(
      svc.login({ email: 'test@oben.com', password: 'CorrectPass123!', tenantSlug: 'oben' }),
    ).rejects.toThrow(/bloqueada temporalmente/);
  });

  it('bloqueo vencido permite login normalmente', async () => {
    const { users, tenants } = makeRepos(makeUser({ lockedUntil: new Date(Date.now() - 1000) }));
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never);
    const res = await svc.login({ email: 'test@oben.com', password: 'CorrectPass123!', tenantSlug: 'oben' });
    expect(res.access_token).toBeTruthy();
  });

  it('refresh() rota el token y avanza tokenVersion', async () => {
    const { users, tenants } = makeRepos(makeUser());
    const jwt = makeJwt();
    const svc = new AuthService(users as never, tenants as never, jwt as never);
    const login = await svc.login({ email: 'test@oben.com', password: 'CorrectPass123!', tenantSlug: 'oben' });

    const refreshed = await svc.refresh(login.refresh_token);
    expect(refreshed.access_token).not.toBe(login.access_token);
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ tokenVersion: 1 }));
  });

  it('refresh() rechaza un token ya rotado (reutilización = revocado)', async () => {
    const { users, tenants } = makeRepos(makeUser());
    const jwt = makeJwt();
    const svc = new AuthService(users as never, tenants as never, jwt as never);
    const login = await svc.login({ email: 'test@oben.com', password: 'CorrectPass123!', tenantSlug: 'oben' });

    await svc.refresh(login.refresh_token);
    // Reutilizar el MISMO refresh token original (ya rotado) debe fallar.
    await expect(svc.refresh(login.refresh_token)).rejects.toThrow(/revocado/);
  });

  it('logout() invalida el refresh token vigente (avanza tokenVersion)', async () => {
    const { users, tenants } = makeRepos(makeUser());
    const jwt = makeJwt();
    const svc = new AuthService(users as never, tenants as never, jwt as never);
    const login = await svc.login({ email: 'test@oben.com', password: 'CorrectPass123!', tenantSlug: 'oben' });

    await svc.logout('u1');
    await expect(svc.refresh(login.refresh_token)).rejects.toThrow(/revocado/);
  });
});
