import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EquivalencesController } from './equivalences.controller';
import { CreateEquivalenceDto, UpdateEquivalenceDto } from './dto/client-product-equivalence.dto';

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

describe('DTOs de equivalencias', () => {
  it('un código hecho solo de espacios no es válido', async () => {
    const dto = plainToInstance(CreateEquivalenceDto, {
      clientId: '6f1c1f7e-8d3a-4c55-9d7e-0b5b1b6f2a10',
      clientCode: '   ',
      obenCode: 'SC15TN',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['clientCode']);
  });

  it('clientId debe ser un UUID', async () => {
    const dto = plainToInstance(CreateEquivalenceDto, { clientId: 'c1', clientCode: 'BOPP 1', obenCode: 'SC15TN' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['clientId']);
  });

  it('update parcial válido', async () => {
    const errors = await validate(plainToInstance(UpdateEquivalenceDto, { obenCode: 'SC20TN' }));
    expect(errors).toEqual([]);
  });
});
