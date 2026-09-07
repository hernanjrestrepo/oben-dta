import { BadRequestException } from '@nestjs/common';
import { PackingListAutomationService } from './packing-list-automation.service';

const PACKING_DATA_GENERIC = {
  Cliente: 'ETIQUETAS Y CAPSULAS DE COLOMBIA ETICAP SA',
  Documento: 'Guia_Venta',
  Numero: '10982',
  DetailedPackingList: [{ Descripcion: 'X', Lote: '1' }],
};

const PACKING_DATA_SOLEFILMES = {
  Cliente: 'SOLEFILMES IMPORTACAO DISTRIBUICAO E LOGISTICA LTDA',
  DetailedPackingList: [],
};

const SOLEFILMES_SHIPMENT_DATA = {
  Customer: 'SOLEFILMES IMPORTACAO DISTRIBUICAO E LOGISTICA LTDA',
  Date: '2026-09-07',
  OrderNumber: '10824',
  TotalNetWeight: 100,
  TotalGrossWeight: 110,
  Rolls: 2,
  Pallets: 1,
  Detalle1: [],
};

function makeService(hubCall: jest.Mock, resolveRecipients?: jest.Mock) {
  const hub = { call: hubCall } as any;
  const ctx = { userId: 'u1', tenantId: 't1' } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const distributionLists = {
    resolveRecipients: resolveRecipients ?? jest.fn().mockResolvedValue({ to: ['ops@oben.com'], cc: [], bcc: [] }),
  } as any;
  const excel = { build: jest.fn().mockReturnValue(Buffer.from('xlsx')) } as any;
  const solefilmesPdf = { build: jest.fn().mockResolvedValue(Buffer.from('pdf')) } as any;
  return {
    service: new PackingListAutomationService(hub, ctx, audit, distributionLists, excel, solefilmesPdf),
    audit,
    excel,
    solefilmesPdf,
  };
}

describe('PackingListAutomationService', () => {
  it('cliente normal: genera Excel y lo envía a la lista de distribución', async () => {
    const hubCall = jest.fn()
      .mockResolvedValueOnce({ ok: true, data: PACKING_DATA_GENERIC }) // spPackingListUSA_Paradixe
      .mockResolvedValueOnce({ ok: true, data: { id: 'msg-1' } }); // email.send
    const { service, excel } = makeService(hubCall);

    const result = await service.handleOvApproved(10982);

    expect(result).toEqual({ sent: true, client: PACKING_DATA_GENERIC.Cliente, format: 'excel' });
    expect(excel.build).toHaveBeenCalledWith('Lista de Empaque', 10982, PACKING_DATA_GENERIC, 'packing_list');
    expect(hubCall).toHaveBeenCalledTimes(2);
    const emailArgs = hubCall.mock.calls[1][2];
    expect(emailArgs.to).toBe('ops@oben.com');
    expect(emailArgs.attachments[0].contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('cliente Solefilmes: consulta el SP adicional y genera PDF en vez de Excel', async () => {
    const hubCall = jest.fn()
      .mockResolvedValueOnce({ ok: true, data: PACKING_DATA_SOLEFILMES }) // spPackingListUSA_Paradixe
      .mockResolvedValueOnce({ ok: true, data: SOLEFILMES_SHIPMENT_DATA }) // spEmpaqueSolefilmes_Paradixe
      .mockResolvedValueOnce({ ok: true, data: { id: 'msg-2' } }); // email.send
    const { service, solefilmesPdf, excel } = makeService(hubCall);

    const result = await service.handleOvApproved(10824);

    expect(result.format).toBe('pdf');
    expect(hubCall).toHaveBeenNthCalledWith(2, 'obenCostOrder', 'query.run', {
      procedure: 'spEmpaqueSolefilmes_Paradixe',
      numberOrderSales: 10824,
    });
    expect(solefilmesPdf.build).toHaveBeenCalledWith(SOLEFILMES_SHIPMENT_DATA);
    expect(excel.build).not.toHaveBeenCalled();
    const emailArgs = hubCall.mock.calls[2][2];
    expect(emailArgs.attachments[0].contentType).toBe('application/pdf');
  });

  it('sin lista de distribución configurada: audita y rechaza sin enviar correo', async () => {
    const hubCall = jest.fn().mockResolvedValueOnce({ ok: true, data: PACKING_DATA_GENERIC });
    const resolveRecipients = jest.fn().mockResolvedValue({ to: [], cc: [], bcc: [] });
    const { service, audit } = makeService(hubCall, resolveRecipients);

    await expect(service.handleOvApproved(10982)).rejects.toThrow(BadRequestException);
    expect(hubCall).toHaveBeenCalledTimes(1); // nunca llega a email.send
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ov_approved_sin_lista_distribucion' }),
    );
  });

  it('si Oben no responde la lista de empaque, rechaza sin generar nada', async () => {
    const hubCall = jest.fn().mockResolvedValueOnce({ ok: false, error: 'unreachable' });
    const { service, excel, solefilmesPdf } = makeService(hubCall);

    await expect(service.handleOvApproved(10982)).rejects.toThrow(BadRequestException);
    expect(excel.build).not.toHaveBeenCalled();
    expect(solefilmesPdf.build).not.toHaveBeenCalled();
  });
});
