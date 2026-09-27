import { EquivalencesController } from './equivalences.controller';

describe('EquivalencesController', () => {
  function makeController(overrides: Partial<Record<string, jest.Mock>> = {}) {
    const service = {
      create: overrides.create ?? jest.fn(),
      findAll: overrides.findAll ?? jest.fn(),
      resolve: overrides.resolve ?? jest.fn(),
      findOne: overrides.findOne ?? jest.fn(),
      update: overrides.update ?? jest.fn(),
      remove: overrides.remove ?? jest.fn(),
    } as any;
    return { controller: new EquivalencesController(service), service };
  }

  it('create delega en el servicio', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'eq-1' });
    const { controller } = makeController({ create });
    const dto = { clientId: 'c1', clientCode: 'BOPP 15', obenCode: 'SC15TN' };

    const result = await controller.create(dto as any);

    expect(create).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 'eq-1' });
  });

  it('findAll pasa el filtro de clientId opcional', async () => {
    const findAll = jest.fn().mockResolvedValue([]);
    const { controller } = makeController({ findAll });

    await controller.findAll('c1');

    expect(findAll).toHaveBeenCalledWith('c1');
  });

  it('resolve pasa clientId y clientCode al servicio', async () => {
    const resolve = jest.fn().mockResolvedValue('SC15TN');
    const { controller } = makeController({ resolve });

    const result = await controller.resolve('c1', 'BOPP 15');

    expect(resolve).toHaveBeenCalledWith('c1', 'BOPP 15');
    expect(result).toBe('SC15TN');
  });
});
