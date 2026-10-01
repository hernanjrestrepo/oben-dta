import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { EnvioManualService } from './envio-manual.service';

const LISTA = {
  id: 'l1',
  name: 'Lista de Empaque — Oben',
  ownerUserIds: ['dueno'],
  disparador: 'automatico',
  recipients: [
    { email: 'a@oben.com', role: 'to' },
    { email: 'b@oben.com', role: 'to' },
    { email: 'c@oben.com', role: 'cc' },
  ],
  associations: [
    { entityType: 'document', entityKey: 'packing_list' },
    { entityType: 'document', entityKey: 'empaque_unificada' },
    { entityType: 'document', entityKey: 'facturacion' },
  ],
};

function build(opts: { userId?: string; admin?: boolean; paquete?: { failed: unknown[] } } = {}) {
  const ctx = { tenantId: 't1', tenantIdOrNull: 't1', userId: opts.userId ?? 'dueno', isSuperAdmin: false };
  const repo = { findOne: jest.fn(async () => LISTA), find: jest.fn(async () => [LISTA]) };
  const authz = { can: jest.fn(async () => ({ effect: opts.admin ? 'allow' : 'deny' })) };
  const audit = { log: jest.fn() };
  const listas = new DistributionListsService(repo as never, {} as never, {} as never, ctx as never, authz as never, audit as never);
  const adj = (key: string) => ({ key, label: key, filename: `${key}.xlsx`, contentType: 'x', buffer: Buffer.from('x') });
  const reports = {
    buildDocumentPackage: jest.fn(async () => ({ client: 'ACME', included: [adj('empaque_unificada'), adj('lista')], failed: opts.paquete?.failed ?? [], simulated: false })),
    buildReport: jest.fn(async () => ({ ok: true, attachment: adj('empaque_unificada'), simulated: false })),
  };
  const hub = { call: jest.fn(async () => ({ ok: true, data: { id: 'm1' } })) };
  const svc = new EnvioManualService(listas, reports as never, hub as never, ctx as never, audit as never);
  return { svc, hub, reports, audit };
}

describe('EnvioManualService — "Enviar ahora" de una lista (WO-026)', () => {
  it('el dueño envía la Lista de Empaque solo a los destinatarios de SU lista', async () => {
    const { svc, hub, audit } = build();
    const r = await svc.enviar('l1', 'packing_list', 11187);
    expect(r.para).toEqual(['a@oben.com', 'b@oben.com']);
    const args = (hub.call.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(args.to).toBe('a@oben.com');
    expect(args.cc).toBe('b@oben.com,c@oben.com');
    expect(args.subject).toBe('Lista de Empaque — Orden 11187');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'lista_envio_manual' }));
  });

  it('quien no es dueño ni administrador no puede disparar', async () => {
    const { svc, hub } = build({ userId: 'otro' });
    await expect(svc.enviar('l1', 'packing_list', 11187)).rejects.toBeInstanceOf(ForbiddenException);
    expect(hub.call).not.toHaveBeenCalled();
  });

  it('administración puede disparar aunque no sea dueño', async () => {
    const { svc } = build({ userId: 'otro', admin: true });
    await expect(svc.enviar('l1', 'empaque_unificada', 11187)).resolves.toMatchObject({ enviado: true });
  });

  it('la Lista de Empaque incompleta no sale', async () => {
    const { svc, hub } = build({ paquete: { failed: [{ key: 'consumo_mp', label: 'Consumo de Materia Prima', error: 'x' }] } });
    await expect(svc.enviar('l1', 'packing_list', 11187)).rejects.toThrow(/incompleta/);
    expect(hub.call).not.toHaveBeenCalled();
  });

  it('un documento que no se envía a mano (borrador de factura) o no asociado a la lista se rechaza', async () => {
    const { svc } = build();
    await expect(svc.enviar('l1', 'facturacion', 11187)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.enviar('l1', 'consumo_me', 11187)).rejects.toThrow(/no tiene asociado/);
  });
});
