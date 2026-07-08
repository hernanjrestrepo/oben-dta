import { NotFoundException, ConflictException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Tenant, TenantStatus } from '../../entities/tenant.entity';

type PartialRepo = {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

function makeRepo(): PartialRepo {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((partial) => ({ ...partial }) as unknown as Tenant),
    save: jest.fn(async (entity) => entity as Tenant),
  };
}

function makeService(repo: PartialRepo): TenantsService {
  return new TenantsService(repo as unknown as never);
}

describe('TenantsService', () => {
  it('crea un tenant con defaults sensatos si no vienen', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValueOnce(null);
    const svc = makeService(repo);
    const created = await svc.create({ slug: 'acme', name: 'ACME' });
    expect(created.slug).toBe('acme');
    expect(created.countryCode).toBe('CO');
    expect(created.defaultCurrency).toBe('COP');
    expect(created.timezone).toBe('America/Bogota');
    expect(created.status).toBe(TenantStatus.ACTIVE);
  });

  it('rechaza slug duplicado', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValueOnce({ id: 'x', slug: 'acme' });
    const svc = makeService(repo);
    await expect(svc.create({ slug: 'acme', name: 'ACME' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('findById devuelve NotFound si no existe', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValueOnce(null);
    const svc = makeService(repo);
    await expect(svc.findById('no-existe')).rejects.toThrow(NotFoundException);
  });

  it('ensureBootstrapTenant no crea si ya existe', async () => {
    const existing = { id: '1', slug: 'oben' } as Tenant;
    const repo = makeRepo();
    repo.findOne.mockResolvedValueOnce(existing);
    const svc = makeService(repo);
    const t = await svc.ensureBootstrapTenant();
    expect(t).toBe(existing);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('ensureBootstrapTenant crea "oben" si falta', async () => {
    const repo = makeRepo();
    // findOne del ensure devuelve null, y luego el create/save es interno
    repo.findOne.mockResolvedValueOnce(null); // ensure lookup
    repo.findOne.mockResolvedValueOnce(null); // conflict check dentro de create
    const svc = makeService(repo);
    const t = await svc.ensureBootstrapTenant();
    expect(t.slug).toBe('oben');
    expect(t.status).toBe(TenantStatus.ACTIVE);
  });
});
