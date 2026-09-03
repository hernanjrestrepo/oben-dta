import { NotFoundException } from '@nestjs/common';
import { DistributionListsService } from './distribution-lists.service';

function makeRepoMock() {
  return {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: 'list-1', ...v })),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };
}

function makeService() {
  const lists = makeRepoMock();
  const recipients = makeRepoMock();
  const associations = makeRepoMock();
  const ctx = { tenantId: 't1' } as any;
  const service = new DistributionListsService(lists as any, recipients as any, associations as any, ctx);
  return { service, lists, recipients, associations };
}

describe('DistributionListsService', () => {
  it('create() crea la lista con sus destinatarios, con el tenantId correcto', async () => {
    const { service, lists } = makeService();
    await service.create({
      name: 'Empaque Oben',
      recipients: [{ email: 'a@x.com', role: 'to' }, { email: 'b@x.com', role: 'cc' }],
    });
    expect(lists.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Empaque Oben', tenantId: 't1' }),
    );
    expect(lists.save).toHaveBeenCalled();
  });

  it('findOne() lanza NotFoundException si la lista no existe en el tenant', async () => {
    const { service, lists } = makeService();
    lists.findOne.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('associate() es idempotente: si ya existe la asociación, no crea una duplicada', async () => {
    const { service, lists, associations } = makeService();
    lists.findOne.mockResolvedValue({ id: 'list-1', recipients: [], associations: [] });
    associations.findOne.mockResolvedValue({ id: 'assoc-1', entityType: 'document', entityKey: 'packing_list' });

    const result = await service.associate('list-1', { entityType: 'document', entityKey: 'packing_list' });

    expect(result).toEqual({ id: 'assoc-1', entityType: 'document', entityKey: 'packing_list' });
    expect(associations.save).not.toHaveBeenCalled();
  });

  it('resolveRecipients() devuelve vacío si no hay ninguna lista asociada — nunca inventa un destinatario', async () => {
    const { service, associations } = makeService();
    associations.find.mockResolvedValue([]);
    const result = await service.resolveRecipients('document', 'packing_list');
    expect(result).toEqual({ to: [], cc: [], bcc: [] });
  });

  it('resolveRecipients() agrupa por rol los destinatarios de todas las listas asociadas', async () => {
    const { service, associations, recipients } = makeService();
    associations.find.mockResolvedValue([
      { distributionListId: 'list-1' },
      { distributionListId: 'list-2' },
    ]);
    recipients.find.mockResolvedValue([
      { email: 'principal@oben.com', role: 'to' },
      { email: 'copia1@oben.com', role: 'cc' },
      { email: 'copia2@paradixe.co', role: 'cc' },
      { email: 'oculto@paradixe.co', role: 'bcc' },
    ]);

    const result = await service.resolveRecipients('document', 'packing_list');

    expect(result).toEqual({
      to: ['principal@oben.com'],
      cc: ['copia1@oben.com', 'copia2@paradixe.co'],
      bcc: ['oculto@paradixe.co'],
    });
  });
});
