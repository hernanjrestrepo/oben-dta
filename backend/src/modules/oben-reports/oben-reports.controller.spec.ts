import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ObenReportsController } from './oben-reports.controller';
import { ObenReportExcelService } from './oben-report-excel.service';

function makeController(hubCall: jest.Mock, resolveRecipients?: jest.Mock) {
  const hub = { call: hubCall } as any;
  const ctx = { userId: 'u1', tenantId: 't1' } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const distributionLists = {
    resolveRecipients: resolveRecipients ?? jest.fn().mockResolvedValue({ to: [], cc: [], bcc: [] }),
  } as any;
  const excel = new ObenReportExcelService();
  return {
    controller: new ObenReportsController(hub, ctx, audit, distributionLists, excel),
    audit,
  };
}

const SAMPLE = { Cliente: 'ETIQUETAS Y CAPSULAS DE COLOMBIA', OrdenVenta: '10794', Detalle: [{ Material: 'X', Cantidad: 5 }] };

describe('ObenReportsController', () => {
  it('list() devuelve los 7 reportes con key/label, sin llamar al hub', () => {
    const { controller } = makeController(jest.fn());
    const list = controller.list();
    expect(list).toHaveLength(7);
    expect(list.map((r) => r.key)).toContain('consumo_me');
  });

  describe('GET :key/:numberOrderSales', () => {
    it('consulta el stored procedure real asociado al key', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: SAMPLE });
      const { controller } = makeController(hubCall);
      const result = await controller.getReport('consumo_me', '10794');
      expect(result).toEqual(SAMPLE);
      expect(hubCall).toHaveBeenCalledWith('obenCostOrder', 'query.run', {
        procedure: 'spConsumoME_Paradixe',
        numberOrderSales: 10794,
      });
    });

    it('rechaza un key de reporte inexistente', async () => {
      const hubCall = jest.fn();
      const { controller } = makeController(hubCall);
      await expect(controller.getReport('no_existe', '10794')).rejects.toThrow(NotFoundException);
      expect(hubCall).not.toHaveBeenCalled();
    });
  });

  describe('POST :key/:numberOrderSales/send', () => {
    it('genera el xlsx y lo envía adjunto por correo', async () => {
      const hubCall = jest.fn()
        .mockResolvedValueOnce({ ok: true, data: SAMPLE })
        .mockResolvedValueOnce({ ok: true, data: { id: 'msg-1' } });
      const { controller, audit } = makeController(hubCall);

      const result = await controller.sendReport('consumo_me', '10794', { to: 'x@oben.com' });

      expect(result).toEqual({ sent: true, to: 'x@oben.com', cc: [] });
      const emailArgs = hubCall.mock.calls[1][2];
      expect(emailArgs.attachments[0].filename).toContain('OV10794');
      expect(emailArgs.attachments[0].encoding).toBe('base64');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'email_sent' }));
    });

    it('sin destinatario y sin lista de distribución asociada, rechaza sin enviar', async () => {
      const hubCall = jest.fn().mockResolvedValueOnce({ ok: true, data: SAMPLE });
      const { controller } = makeController(hubCall);
      await expect(controller.sendReport('consumo_me', '10794', {})).rejects.toThrow(BadRequestException);
      expect(hubCall).toHaveBeenCalledTimes(1);
    });

    it('resuelve destinatario desde la lista de distribución asociada al key del reporte', async () => {
      const hubCall = jest.fn()
        .mockResolvedValueOnce({ ok: true, data: SAMPLE })
        .mockResolvedValueOnce({ ok: true, data: { id: 'msg-2' } });
      const resolveRecipients = jest.fn().mockResolvedValue({ to: ['a@oben.com'], cc: [], bcc: [] });
      const { controller } = makeController(hubCall, resolveRecipients);

      await controller.sendReport('empaque_unificada', '10794', {});
      expect(resolveRecipients).toHaveBeenCalledWith('document', 'empaque_unificada');
    });
  });

  describe('GET :key/:numberOrderSales/excel', () => {
    it('construye el .xlsx y lo devuelve como descarga', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: SAMPLE });
      const { controller } = makeController(hubCall);
      const res = { setHeader: jest.fn(), send: jest.fn() } as any;

      await controller.downloadExcel('consumo_me', '10794', res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('OV10794.xlsx'),
      );
      expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
    });
  });

  describe('POST package/:numberOrderSales/send', () => {
    it('adjunta un .xlsx por cada reporte que sí respondió, e informa los que fallaron', async () => {
      // spCheckSettlement_Paradixe falla, los otros 6 responden bien.
      const hubCall = jest.fn().mockImplementation((system: string, _op: string, args: any) => {
        if (system === 'email') return Promise.resolve({ ok: true, data: { id: 'msg-pkg' } });
        if (args.procedure === 'spCheckSettlement_Paradixe') {
          return Promise.resolve({ ok: false, error: 'falta parametro' });
        }
        return Promise.resolve({ ok: true, data: SAMPLE });
      });
      const { controller, audit } = makeController(hubCall);

      const result = await controller.sendPackage('10794', { to: 'x@oben.com' });

      expect(result.sent).toBe(true);
      expect(result.included).not.toContain('check_settlement');
      expect(result.included.length).toBe(6);
      expect(result.failed).toEqual([{ key: 'check_settlement', error: 'falta parametro' }]);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'document_package_sent' }),
      );
    });

    it('si ningún reporte se pudo consultar, rechaza sin llamar a enviar correo', async () => {
      const hub = { call: jest.fn().mockResolvedValue({ ok: false, error: 'unreachable' }) } as any;
      const ctx = { userId: 'u1', tenantId: 't1' } as any;
      const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
      const distributionLists = { resolveRecipients: jest.fn() } as any;
      const controller = new ObenReportsController(hub, ctx, audit, distributionLists, new ObenReportExcelService());

      await expect(controller.sendPackage('10794', { to: 'x@oben.com' })).rejects.toThrow(BadRequestException);
      expect(hub.call).not.toHaveBeenCalledWith('email', 'send', expect.anything());
    });
  });
});
