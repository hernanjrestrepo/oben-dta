import { BadRequestException } from '@nestjs/common';
import { PackingListAutomationService } from './packing-list-automation.service';

const PACKAGE_RESULT = {
  client: 'ETIQUETAS Y CAPSULAS DE COLOMBIA ETICAP SA',
  included: [
    { key: 'lista_especial', label: 'Lista Especial', filename: 'Lista_Especial-OV10982.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('a') },
    { key: 'consumo_me', label: 'Consumo de Material de Empaque', filename: 'ConsumoME-OV10982.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('b') },
  ],
  failed: [{ key: 'consumo_mp', label: 'Consumo de Materia Prima', error: 'no data' }],
};

const SOLEFILMES_PACKAGE_RESULT = {
  client: 'SOLEFILMES IMPORTACAO DISTRIBUICAO E LOGISTICA LTDA',
  included: [
    { key: 'lista_especial', label: 'Lista Especial', filename: 'Lista_Especial-OV10824.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('a') },
    { key: 'empaque_solefilmes', label: 'Empaque Solefilmes', filename: 'Shipment_Traceability-OV10824.pdf', contentType: 'application/pdf', buffer: Buffer.from('b') },
  ],
  failed: [],
};

function makeService(hubCall: jest.Mock, resolveRecipients?: jest.Mock, buildDocumentPackage?: jest.Mock, confirmApproveComex?: jest.Mock) {
  const hub = { call: hubCall } as any;
  const ctx = { userId: 'u1', tenantId: 't1' } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const distributionLists = {
    resolveRecipients: resolveRecipients ?? jest.fn().mockResolvedValue({ to: ['ops@oben.com'], cc: [], bcc: [] }),
  } as any;
  const reports = {
    buildDocumentPackage: buildDocumentPackage ?? jest.fn().mockResolvedValue(PACKAGE_RESULT),
    confirmApproveComex: confirmApproveComex ?? jest.fn().mockResolvedValue({ ok: true }),
  } as any;
  return {
    service: new PackingListAutomationService(hub, ctx, audit, distributionLists, reports),
    audit,
    reports,
  };
}

describe('PackingListAutomationService', () => {
  it('arma un solo paquete y manda un solo correo con todo lo incluido, informando lo que falló', async () => {
    const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'msg-1' } });
    const buildDocumentPackage = jest.fn().mockResolvedValue(PACKAGE_RESULT);
    const { service, reports } = makeService(hubCall, undefined, buildDocumentPackage);

    const result = await service.handleOvApproved(10982);

    expect(buildDocumentPackage).toHaveBeenCalledWith(10982);
    expect(result).toEqual({
      sent: true,
      client: PACKAGE_RESULT.client,
      included: ['lista_especial', 'consumo_me'],
      failed: ['consumo_mp'],
    });
    const emailArgs = hubCall.mock.calls[0][2];
    expect(emailArgs.to).toBe('ops@oben.com');
    expect(emailArgs.subject).toBe('Lista de Empaque — Orden 10982');
    expect(emailArgs.attachments.map((a: any) => a.filename)).toEqual([
      'Lista_Especial-OV10982.xlsx',
      'ConsumoME-OV10982.xlsx',
    ]);
    expect(emailArgs.body).toContain('Consumo de Materia Prima (no data)');
    expect(reports.confirmApproveComex).toHaveBeenCalledWith(10982);
  });

  it('cliente Solefilmes: el asunto lo indica cuando empaque_solefilmes viene incluido', async () => {
    const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'msg-2' } });
    const buildDocumentPackage = jest.fn().mockResolvedValue(SOLEFILMES_PACKAGE_RESULT);
    const { service } = makeService(hubCall, undefined, buildDocumentPackage);

    const result = await service.handleOvApproved(10824);

    expect(result.included).toContain('empaque_solefilmes');
    const emailArgs = hubCall.mock.calls[0][2];
    expect(emailArgs.subject).toBe('Lista de Empaque — Orden 10824 (Solefilmes)');
  });

  it('sin lista de distribución configurada: audita y rechaza sin enviar correo', async () => {
    const resolveRecipients = jest.fn().mockResolvedValue({ to: [], cc: [], bcc: [] });
    const hubCall = jest.fn();
    const { service, audit } = makeService(hubCall, resolveRecipients);

    await expect(service.handleOvApproved(10982)).rejects.toThrow(BadRequestException);
    expect(hubCall).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ov_approved_sin_lista_distribucion' }),
    );
  });

  it('si no se pudo generar ningún documento, rechaza sin intentar enviar', async () => {
    const buildDocumentPackage = jest.fn().mockResolvedValue({
      client: '',
      included: [],
      failed: [{ key: 'lista_especial', label: 'Lista Especial', error: 'no se pudo consultar la lista de empaque' }],
    });
    const hubCall = jest.fn();
    const { service } = makeService(hubCall, undefined, buildDocumentPackage);

    await expect(service.handleOvApproved(10982)).rejects.toThrow(BadRequestException);
    expect(hubCall).not.toHaveBeenCalled();
  });

  it('si el correo no se pudo enviar, no confirma spApproveComex', async () => {
    const hubCall = jest.fn().mockResolvedValue({ ok: false, error: 'smtp down' });
    const { service, reports } = makeService(hubCall);

    await expect(service.handleOvApproved(10982)).rejects.toThrow(BadRequestException);
    expect(reports.confirmApproveComex).not.toHaveBeenCalled();
  });
});
