import { ConflictException, NotFoundException } from '@nestjs/common';
import { EquivalencesService } from './equivalences.service';

const TENANT_ID = 't1';

function makeService(repoOverrides: Partial<Record<string, jest.Mock>> = {}) {
  const repo = {
    create: repoOverrides.create ?? jest.fn((x: unknown) => x),
    save: repoOverrides.save ?? jest.fn(async (x: unknown) => ({ id: 'eq-1', ...(x as object) })),
    find: repoOverrides.find ?? jest.fn().mockResolvedValue([]),
    findOne: repoOverrides.findOne ?? jest.fn().mockResolvedValue(null),
    delete: repoOverrides.delete ?? jest.fn().mockResolvedValue(undefined),
  } as any;
  const ctx = { tenantId: TENANT_ID } as any;
  return { service: new EquivalencesService(repo, ctx), repo };
}

describe('EquivalencesService (homologación cliente↔producto)', () => {
  it('create: guarda la equivalencia con el tenant actual', async () => {
    const { service, repo } = makeService();

    const result = await service.create({ clientId: 'c1', clientCode: 'BOPP 15', obenCode: 'SC15TN' });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, clientId: 'c1', clientCode: 'BOPP 15', obenCode: 'SC15TN' }),
    );
    expect(result).toMatchObject({ clientCode: 'BOPP 15', obenCode: 'SC15TN' });
  });

  it('create: si ya existe esa combinación cliente+código, rechaza con un mensaje claro (no un error de Postgres crudo)', async () => {
    const save = jest.fn().mockRejectedValue({ code: '23505' });
    const { service } = makeService({ save });

    await expect(
      service.create({ clientId: 'c1', clientCode: 'BOPP 15', obenCode: 'SC15TN' }),
    ).rejects.toThrow(ConflictException);
  });

  it('findAll: filtra por tenant y opcionalmente por cliente', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const { service } = makeService({ find });

    await service.findAll('c1');

    expect(find).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, clientId: 'c1' },
      order: { clientCode: 'ASC' },
    });
  });

  it('findOne: lanza NotFoundException si no existe en el tenant actual', async () => {
    const { service } = makeService({ findOne: jest.fn().mockResolvedValue(null) });

    await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
  });

  it('resolve: devuelve el código interno de Oben si hay homologación registrada', async () => {
    const findOne = jest.fn().mockResolvedValue({ obenCode: 'SC15TN' });
    const { service } = makeService({ findOne });

    const result = await service.resolve('c1', 'BOPP 15');

    expect(result).toBe('SC15TN');
    expect(findOne).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID, clientId: 'c1', clientCode: 'BOPP 15' } });
  });

  it('resolve: null si no hay homologación — nunca adivina un código', async () => {
    const { service } = makeService({ findOne: jest.fn().mockResolvedValue(null) });

    const result = await service.resolve('c1', 'algo-desconocido');

    expect(result).toBeNull();
  });

  it('remove: valida que exista en el tenant antes de borrar', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 'eq-1' });
    const del = jest.fn().mockResolvedValue(undefined);
    const { service } = makeService({ findOne, delete: del });

    await service.remove('eq-1');

    expect(del).toHaveBeenCalledWith({ tenantId: TENANT_ID, id: 'eq-1' });
  });
});
