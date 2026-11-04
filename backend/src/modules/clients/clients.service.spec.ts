import { BadRequestException } from '@nestjs/common';
import { ClientsService } from './clients.service';

function make(existing: Record<string, unknown>[] = []) {
  const repo = {
    findOne: jest.fn(async ({ where }: any) => existing.find((c) => c.clientId === where.clientId) ?? null),
    find: jest.fn().mockResolvedValue(existing),
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ClientsService(repo as never, { tenantId: 't1', userId: 'u1' } as never);
  return { service, repo };
}

describe('ClientsService — maestro de clientes para el flujo Comercial', () => {
  it('create normaliza los dominios autorizados y rechaza uno inválido', async () => {
    const { service, repo } = make();
    await service.create({ clientId: 'C1', name: 'Cliente', email: 'compras@cliente.com', authorizedDomains: ['@Cliente.com', 'cliente.com'] });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ authorizedDomains: ['cliente.com'] }));
    await expect(service.create({ clientId: 'C2', name: 'X', email: 'a@b.co', authorizedDomains: ['no valido'] })).rejects.toThrow(BadRequestException);
  });

  describe('findByEmailDomain (anti-fraude: dominio EXACTO)', () => {
    it('un solo cliente con ese dominio → ese cliente', async () => {
      const { service, repo } = make([{ id: 'c1', clientId: 'C1' }]);
      await expect(service.findByEmailDomain('Cliente.com')).resolves.toEqual({ client: { id: 'c1', clientId: 'C1' }, ambiguous: false });
      const where = repo.find.mock.calls[0][0].where;
      expect(where).toHaveLength(2);
      expect(where[0]).toMatchObject({ tenantId: 't1', isActive: true });
    });

    it('varios clientes con el mismo dominio (ej. gmail.com) → ambiguo, no se adivina', async () => {
      const { service } = make([{ id: 'c1' }, { id: 'c2' }]);
      await expect(service.findByEmailDomain('gmail.com')).resolves.toEqual({ client: null, ambiguous: true });
    });

    it('sin dominio autorizado, el cliente cuyo nombre coincide con el dominio (único) se da por hecho y queda autorizado', async () => {
      const { service, repo } = make();
      repo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'c1', name: 'DORFAN S.A.S', authorizedDomains: [] }, { id: 'c2', name: 'OTRA SAS', authorizedDomains: [] }]);
      repo.save = jest.fn(async (c: unknown) => c);
      const r = await service.findByEmailDomain('dorfan.com');
      expect(r.client).toMatchObject({ id: 'c1', authorizedDomains: ['dorfan.com'] });
      expect(repo.save).toHaveBeenCalled();
    });

    it('findByNameInText: el asunto nombra al cliente con 2+ palabras de su nombre', async () => {
      const { service, repo } = make();
      repo.find.mockResolvedValue([{ id: 'v', name: 'CASTAÑEDA HERNANDEZ VICTOR ALFONSO' }, { id: 'm', name: 'CASTAÑO NEIVA MAGDALENA' }]);
      await expect(service.findByNameInText('RV: NUEVO PEDIDO VICTOR CASTAÑEDA')).resolves.toMatchObject({ id: 'v' });
      await expect(service.findByNameInText('RV: pedido urgente')).resolves.toBeNull();
    });

    it('correo gratuito o nombre ambiguo → no se adivina', async () => {
      const { service, repo } = make();
      repo.find.mockResolvedValue([]);
      await expect(service.findByEmailDomain('gmail.com')).resolves.toEqual({ client: null, ambiguous: false });
      repo.find.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'a', name: 'ABAC UNO' }, { id: 'b', name: 'ABAC DOS' }]);
      await expect(service.findByEmailDomain('abac.com')).resolves.toEqual({ client: null, ambiguous: true });
    });

    it('dominio vacío → nada, sin consultar', async () => {
      const { service, repo } = make();
      await expect(service.findByEmailDomain('')).resolves.toEqual({ client: null, ambiguous: false });
      expect(repo.find).not.toHaveBeenCalled();
    });
  });

  describe('importClients', () => {
    const FILA = {
      Código: 'SIM-CLI-01',
      'Código Oben': 'OB-001',
      Nombre: 'Cliente Simulado',
      Correo: 'Compras@Cliente-Simulado.example',
      Dominios: 'cliente-simulado.example; otro-dominio.example',
      'Email comercial': 'comercial@oben-simulado.example',
      'Cliente final en asunto': 'no',
    };

    it('crea y actualiza por código, con dominios y comercial', async () => {
      const { service, repo } = make([{ id: 'x', clientId: 'SIM-CLI-02' }]);
      const res = await service.importClients({ rows: [FILA, { ...FILA, Código: 'SIM-CLI-02', 'Código Oben': '' }] }, 'u1');
      expect(res).toMatchObject({ total: 2, creados: 1, actualizados: 1, errores: [] });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'SIM-CLI-01',
          obenCode: 'OB-001',
          email: 'compras@cliente-simulado.example',
          authorizedDomains: ['cliente-simulado.example', 'otro-dominio.example'],
          comercialEmail: 'comercial@oben-simulado.example',
          finalCustomerInSubject: false,
          tenantId: 't1',
        }),
      );
      expect(repo.update).toHaveBeenCalledWith({ clientId: 'SIM-CLI-02', tenantId: 't1' }, expect.objectContaining({ name: 'Cliente Simulado' }));
    });

    it('sin código interno usa el código de OBEN MAS como código', async () => {
      const { service, repo } = make();
      await service.importClients({ rows: [{ ...FILA, Código: '' }] });
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'OB-001' }));
    });

    it('todo o nada: correo inválido, dominio inválido, código repetido o sí/no ilegible', async () => {
      const { service, repo } = make();
      const res = await service.importClients({
        rows: [
          FILA,
          { ...FILA, Código: 'A', Correo: 'no-es-correo' },
          { ...FILA, Código: 'B', Dominios: 'mal dominio' },
          FILA,
          { ...FILA, Código: 'C', 'Cliente final en asunto': 'tal vez' },
        ],
      });
      expect(res.errores.map((e) => e.fila)).toEqual([3, 4, 5, 6]);
      expect(res).toMatchObject({ creados: 0, actualizados: 0 });
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});

describe('identificarPorContenido (4-nov: el remitente no está registrado)', () => {
  const texto = ['De: Compras INTALPEL S.A.S. <datapel.intalpel@gmail.com>', 'Cc: compras@intalpel.com; juan@intalpel.com; alejandramolinares@obengroup.com', 'Orden de compra Nro. 93252'].join(String.fromCharCode(10));

  it('por los dominios de los correos del texto (copias): ignora Gmail y los de Oben', async () => {
    const { service } = make();
    const espia = jest.spyOn(service, 'findByEmailDomain').mockImplementation(async (d: string) => ({ client: d === 'intalpel.com' ? ({ id: 'c1', name: 'INTALPEL S.A.S' } as never) : null, ambiguous: false }));
    await expect(service.identificarPorContenido(texto, ['obengroup.com'])).resolves.toMatchObject({ id: 'c1' });
    expect(espia.mock.calls.map((c) => c[0])).toEqual(['intalpel.com']);
  });

  it('por el nombre: la primera palabra del cliente (7+ letras) aparece y es única', async () => {
    const { service, repo } = make();
    repo.find.mockResolvedValue([{ id: 'c1', name: 'INTALPEL S.A.S' }, { id: 'c2', name: 'DORFAN S.A.S' }]);
    await expect(service.identificarPorContenido(['Srs. OBEN COLOMBIA', 'Proveedor: INTALPEL S.A.S.', 'OC 93252'].join(' '))).resolves.toMatchObject({ id: 'c1' });
  });

  it('si dos clientes empiezan igual o no aparece ninguno, no adivina', async () => {
    const { service, repo } = make();
    repo.find.mockResolvedValue([{ id: 'c1', name: 'INTALPEL S.A.S' }, { id: 'c2', name: 'INTALPEL COLOMBIA SAS' }]);
    await expect(service.identificarPorContenido('INTALPEL')).resolves.toBeNull();
    repo.find.mockResolvedValue([{ id: 'c1', name: 'DORFAN S.A.S' }]);
    await expect(service.identificarPorContenido('Orden de INTALPEL')).resolves.toBeNull();
  });
});
