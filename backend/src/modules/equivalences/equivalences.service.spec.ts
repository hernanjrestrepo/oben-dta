import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EquivalencesService } from './equivalences.service';

const TENANT_ID = 't1';

function makeService(repoOverrides: Partial<Record<string, jest.Mock>> = {}, clientFindOne?: jest.Mock) {
  const repo = {
    create: repoOverrides.create ?? jest.fn((x: unknown) => x),
    save: repoOverrides.save ?? jest.fn(async (x: unknown) => ({ id: 'eq-1', ...(x as object) })),
    find: repoOverrides.find ?? jest.fn().mockResolvedValue([]),
    findOne: repoOverrides.findOne ?? jest.fn().mockResolvedValue(null),
    delete: repoOverrides.delete ?? jest.fn().mockResolvedValue(undefined),
  } as any;
  const clients = { findOne: clientFindOne ?? jest.fn().mockResolvedValue({ id: 'c1', tenantId: TENANT_ID }) } as any;
  const ctx = { tenantId: TENANT_ID } as any;
  return { service: new EquivalencesService(repo, clients, ctx), repo, clients };
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

  it('create: rechaza un cliente que no es del tenant actual (antes se podía apuntar a otro tenant)', async () => {
    const clientFindOne = jest.fn().mockResolvedValue(null);
    const { service, repo, clients } = makeService({}, clientFindOne);

    await expect(
      service.create({ clientId: 'c-de-otro-tenant', clientCode: 'BOPP 15', obenCode: 'SC15TN' }),
    ).rejects.toThrow(NotFoundException);

    expect(clients.findOne).toHaveBeenCalledWith({ where: { id: 'c-de-otro-tenant', tenantId: TENANT_ID } });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('create/update: guarda los códigos sin espacios sobrantes (si no, resolve no los encontraba)', async () => {
    const { service, repo } = makeService({ findOne: jest.fn().mockResolvedValue({ id: 'eq-1', clientCode: 'X', obenCode: 'Y' }) });

    await service.create({ clientId: 'c1', clientCode: '  BOPP 15 ', obenCode: ' SC15TN ' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ clientCode: 'BOPP 15', obenCode: 'SC15TN' }));

    await service.update('eq-1', { obenCode: ' SC20TN ' });
    expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ clientCode: 'X', obenCode: 'SC20TN' }));
  });

  it('update: un código repetido responde Conflict, no un error de Postgres crudo', async () => {
    const { service } = makeService({
      findOne: jest.fn().mockResolvedValue({ id: 'eq-1', clientCode: 'X', obenCode: 'Y' }),
      save: jest.fn().mockRejectedValue({ code: '23505' }),
    });
    await expect(service.update('eq-1', { clientCode: 'BOPP 1' })).rejects.toThrow(ConflictException);
  });

  it('update: otros errores de escritura se propagan tal cual', async () => {
    const { service } = makeService({
      findOne: jest.fn().mockResolvedValue({ id: 'eq-1', clientCode: 'X', obenCode: 'Y' }),
      save: jest.fn().mockRejectedValue(new Error('db caída')),
    });
    await expect(service.update('eq-1', { clientCode: 'BOPP 1' })).rejects.toThrow('db caída');
  });

  it.each([
    [undefined, 'BOPP 15'],
    ['c1', undefined],
    ['', 'BOPP 15'],
    ['c1', '   '],
  ])('resolve(%j, %j): exige ambos parámetros — TypeORM ignoraría el filtro y devolvería el código de otro cliente', async (clientId, clientCode) => {
    const findOne = jest.fn().mockResolvedValue({ obenCode: 'DE-OTRO-CLIENTE' });
    const { service } = makeService({ findOne });

    await expect(service.resolve(clientId as string, clientCode as string)).rejects.toThrow(BadRequestException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('resolve: ignora espacios sobrantes en el código consultado', async () => {
    const findOne = jest.fn().mockResolvedValue({ obenCode: 'SC15TN' });
    const { service } = makeService({ findOne });

    await service.resolve('c1', ' BOPP 15 ');

    expect(findOne).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID, clientId: 'c1', clientCode: 'BOPP 15' } });
  });

  it('remove: no borra nada si no existe en el tenant actual', async () => {
    const del = jest.fn();
    const { service } = makeService({ findOne: jest.fn().mockResolvedValue(null), delete: del });

    await expect(service.remove('eq-x')).rejects.toThrow(NotFoundException);
    expect(del).not.toHaveBeenCalled();
  });

  it('remove: valida que exista en el tenant antes de borrar', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 'eq-1' });
    const del = jest.fn().mockResolvedValue(undefined);
    const { service } = makeService({ findOne, delete: del });

    await service.remove('eq-1');

    expect(del).toHaveBeenCalledWith({ tenantId: TENANT_ID, id: 'eq-1' });
  });
});
