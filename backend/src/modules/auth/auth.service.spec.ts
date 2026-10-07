import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { TenantStatus } from '../../entities/tenant.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';

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
    findOne: jest.fn(async () => ({
      id: 't1',
      slug: 'oben',
      status: TenantStatus.ACTIVE,
    })),
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
    const svc = new AuthService(
      users as never,
      tenants as never,
      makeJwt() as never,
    );
    const res = await svc.login({
      email: 'test@oben.com',
      password: 'CorrectPass123!',
      tenantSlug: 'oben',
    });
    expect(res.access_token).toBeTruthy();
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }),
    );
  });

  it('password incorrecta incrementa failedLoginAttempts', async () => {
    const { users, tenants } = makeRepos(makeUser());
    const svc = new AuthService(
      users as never,
      tenants as never,
      makeJwt() as never,
    );
    await expect(
      svc.login({
        email: 'test@oben.com',
        password: 'wrong',
        tenantSlug: 'oben',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({ failedLoginAttempts: 1 }),
    );
  });

  it('el 5º intento fallido bloquea la cuenta temporalmente', async () => {
    const { users, tenants } = makeRepos(makeUser({ failedLoginAttempts: 4 }));
    const svc = new AuthService(
      users as never,
      tenants as never,
      makeJwt() as never,
    );
    await expect(
      svc.login({
        email: 'test@oben.com',
        password: 'wrong',
        tenantSlug: 'oben',
      }),
    ).rejects.toThrow(UnauthorizedException);
    const saved = users.save.mock.calls[0][0];
    expect(saved.failedLoginAttempts).toBe(0);
    expect(saved.lockedUntil).toBeInstanceOf(Date);
    expect((saved.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('cuenta bloqueada rechaza incluso la contraseña correcta', async () => {
    const { users, tenants } = makeRepos(
      makeUser({ lockedUntil: new Date(Date.now() + 60_000) }),
    );
    const svc = new AuthService(
      users as never,
      tenants as never,
      makeJwt() as never,
    );
    await expect(
      svc.login({
        email: 'test@oben.com',
        password: 'CorrectPass123!',
        tenantSlug: 'oben',
      }),
    ).rejects.toThrow(/bloqueada temporalmente/);
  });

  it('bloqueo vencido permite login normalmente', async () => {
    const { users, tenants } = makeRepos(
      makeUser({ lockedUntil: new Date(Date.now() - 1000) }),
    );
    const svc = new AuthService(
      users as never,
      tenants as never,
      makeJwt() as never,
    );
    const res = await svc.login({
      email: 'test@oben.com',
      password: 'CorrectPass123!',
      tenantSlug: 'oben',
    });
    expect(res.access_token).toBeTruthy();
  });

  it('refresh() rota el token y avanza tokenVersion', async () => {
    const { users, tenants } = makeRepos(makeUser());
    const jwt = makeJwt();
    const svc = new AuthService(users as never, tenants as never, jwt as never);
    const login = await svc.login({
      email: 'test@oben.com',
      password: 'CorrectPass123!',
      tenantSlug: 'oben',
    });

    const refreshed = await svc.refresh(login.refresh_token);
    expect(refreshed.access_token).not.toBe(login.access_token);
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 1 }),
    );
  });

  it('refresh() rechaza un token ya rotado (reutilización = revocado)', async () => {
    const { users, tenants } = makeRepos(makeUser());
    const jwt = makeJwt();
    const svc = new AuthService(users as never, tenants as never, jwt as never);
    const login = await svc.login({
      email: 'test@oben.com',
      password: 'CorrectPass123!',
      tenantSlug: 'oben',
    });

    await svc.refresh(login.refresh_token);
    // Reutilizar el MISMO refresh token original (ya rotado) debe fallar.
    await expect(svc.refresh(login.refresh_token)).rejects.toThrow(/revocado/);
  });

  it('logout() invalida el refresh token vigente (avanza tokenVersion)', async () => {
    const { users, tenants } = makeRepos(makeUser());
    const jwt = makeJwt();
    const svc = new AuthService(users as never, tenants as never, jwt as never);
    const login = await svc.login({
      email: 'test@oben.com',
      password: 'CorrectPass123!',
      tenantSlug: 'oben',
    });

    await svc.logout('u1');
    await expect(svc.refresh(login.refresh_token)).rejects.toThrow(/revocado/);
  });
});

describe('AuthService.register() — crea un usuario dentro del tenant de quien llama', () => {
  function makeCreateRepos(existing: Array<{ email: string; tenantId: string }> = []) {
    const saved: Array<Record<string, unknown>> = [];
    const users = {
      findOne: jest.fn(async ({ where }: { where: { email: string; tenantId: string } }) =>
        existing.find((u) => u.email === where.email && u.tenantId === where.tenantId) ?? null,
      ),
      create: jest.fn((partial) => partial),
      save: jest.fn(async (entity: Record<string, unknown>) => {
        const withId = { id: 'new-user-1', ...entity };
        saved.push(withId);
        return withId;
      }),
    };
    const tenants = { findOne: jest.fn() };
    return { users, tenants, saved };
  }

  function ctxFor(tenantId: string) {
    const ctx = new TenantContext();
    ctx.setContext(tenantId, 'caller-1', false);
    return ctx;
  }

  it('crea el usuario en el tenant de TenantContext, no en uno elegido por el body', async () => {
    const { users, tenants, saved } = makeCreateRepos();
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never, undefined, undefined, ctxFor('tenant-caller'));

    const result = await svc.register({
      firstName: 'Ana',
      lastName: 'Gómez',
      email: 'ana@oben.com',
      password: 'CorrectPass123!',
      // un campo extra tipo tenantSlug, si llegara, se ignora igual.
      tenantSlug: 'otro-tenant',
    } as never);

    expect(result.tenantId).toBe('tenant-caller');
    expect(saved[0]).toMatchObject({ tenantId: 'tenant-caller', isActive: true, isSuperAdmin: false });
  });

  it('nunca devuelve access_token/refresh_token (quien crea el usuario no debe recibir su sesión)', async () => {
    const { users, tenants } = makeCreateRepos();
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never, undefined, undefined, ctxFor('t1'));

    const result = await svc.register({ firstName: 'A', lastName: 'B', email: 'a@oben.com', password: 'CorrectPass123!' });

    expect(result).not.toHaveProperty('access_token');
    expect(result).not.toHaveProperty('refresh_token');
  });

  it('rechaza un correo ya registrado en el MISMO tenant', async () => {
    const { users, tenants } = makeCreateRepos([{ email: 'dup@oben.com', tenantId: 't1' }]);
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never, undefined, undefined, ctxFor('t1'));

    await expect(
      svc.register({ firstName: 'A', lastName: 'B', email: 'dup@oben.com', password: 'CorrectPass123!' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('el mismo correo SÍ se puede crear en un tenant distinto (aislamiento real)', async () => {
    const { users, tenants, saved } = makeCreateRepos([{ email: 'dup@oben.com', tenantId: 'tenant-a' }]);
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never, undefined, undefined, ctxFor('tenant-b'));

    await svc.register({ firstName: 'A', lastName: 'B', email: 'dup@oben.com', password: 'CorrectPass123!' });

    expect(saved[0]).toMatchObject({ tenantId: 'tenant-b' });
  });

  it('sin TenantContext resuelto, rechaza en vez de crear un usuario sin tenant', async () => {
    const { users, tenants } = makeCreateRepos();
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never);

    await expect(
      svc.register({ firstName: 'A', lastName: 'B', email: 'a@oben.com', password: 'CorrectPass123!' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService.changePassword() — contraseña temporal', () => {
  it('con la contraseña actual correcta: cambia el hash, apaga la obligación, invalida sesiones y entrega tokens nuevos', async () => {
    const { users, tenants, store } = makeRepos(makeUser({ mustChangePassword: true, tokenVersion: 3 }));
    const jwt = makeJwt();
    const svc = new AuthService(users as never, tenants as never, jwt as never);

    const res = await svc.changePassword('u1', 'CorrectPass123!', 'NuevaClave2026!');

    expect(res.access_token).toBeTruthy();
    expect(res.user.mustChangePassword).toBe(false);
    const saved = store.current as unknown as { mustChangePassword: boolean; tokenVersion: number; passwordHash: string };
    expect(saved.mustChangePassword).toBe(false);
    expect(saved.tokenVersion).toBe(4);
    expect(bcrypt.compareSync('NuevaClave2026!', saved.passwordHash)).toBe(true);
    // El token nuevo ya no lleva la marca que bloquea las rutas de negocio.
    expect(jwt.sign.mock.calls.at(-1)![0]).not.toHaveProperty('mustChangePassword');
  });

  it('con la contraseña actual incorrecta: rechaza y cuenta el intento fallido', async () => {
    const { users, tenants } = makeRepos(makeUser({ mustChangePassword: true }));
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never);
    await expect(svc.changePassword('u1', 'mala', 'NuevaClave2026!')).rejects.toThrow(UnauthorizedException);
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ failedLoginAttempts: 1, mustChangePassword: true }));
  });

  it('la nueva no puede ser igual a la actual', async () => {
    const { users, tenants } = makeRepos(makeUser({ mustChangePassword: true }));
    const svc = new AuthService(users as never, tenants as never, makeJwt() as never);
    await expect(svc.changePassword('u1', 'CorrectPass123!', 'CorrectPass123!')).rejects.toThrow(BadRequestException);
  });

  it('el login de un usuario con contraseña temporal lo avisa y marca el token', async () => {
    const { users, tenants } = makeRepos(makeUser({ mustChangePassword: true }));
    const jwt = makeJwt();
    const svc = new AuthService(users as never, tenants as never, jwt as never);
    const res = await svc.login({ email: 'test@oben.com', password: 'CorrectPass123!', tenantSlug: 'oben' });
    expect(res.user.mustChangePassword).toBe(true);
    expect(jwt.sign.mock.calls[0][0]).toMatchObject({ mustChangePassword: true });
  });
});
