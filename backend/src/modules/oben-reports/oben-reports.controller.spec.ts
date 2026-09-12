import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ObenReportsController } from './oben-reports.controller';
import { ObenReportExcelService } from './oben-report-excel.service';

const SAMPLE = { Cliente: 'ETIQUETAS Y CAPSULAS DE COLOMBIA', OrdenVenta: '10794', Detalle: [{ Material: 'X', Cantidad: 5 }] };
const EMPTY_PACKAGE = { client: '', included: [], failed: [] };

function makeController(hubCall: jest.Mock, resolveRecipients?: jest.Mock, buildDocumentPackage?: jest.Mock) {
  const hub = { call: hubCall } as any;
  const ctx = { userId: 'u1', tenantId: 't1' } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const distributionLists = {
    resolveRecipients: resolveRecipients ?? jest.fn().mockResolvedValue({ to: [], cc: [], bcc: [] }),
  } as any;
  const excel = new ObenReportExcelService();
  const reports = {
    buildDocumentPackage: buildDocumentPackage ?? jest.fn().mockResolvedValue(EMPTY_PACKAGE),
    confirmApproveComex: jest.fn().mockResolvedValue({ ok: true }),
  } as any;
  return {
    controller: new ObenReportsController(hub, ctx, audit, distributionLists, excel, reports),
    audit,
    reports,
  };
}

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
      }, expect.any(Object));
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

  // El armado del "conjunto de documentos" (qué reportes incluye, cómo
  // maneja Empaque Solefilmes, etc.) vive en ObenReportsService y tiene sus
  // propios tests (oben-reports.service.spec.ts) — aquí solo se prueba lo
  // que hace el controller con el resultado: resolver destinatario, mandar
  // el correo, auditar.
  describe('POST package/:numberOrderSales/send', () => {
    const PACKAGE_RESULT = {
      client: 'ETIQUETAS Y CAPSULAS DE COLOMBIA',
      included: [
        { key: 'consumo_me', label: 'Consumo de Material de Empaque', filename: 'ConsumoME-OV10794.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('a') },
        { key: 'empaque_solefilmes', label: 'Empaque Solefilmes', filename: 'EmpaqueSolefilmes-OV10794.pdf', contentType: 'application/pdf', buffer: Buffer.from('b') },
      ],
      failed: [{ key: 'consumo_mp', label: 'Consumo de Materia Prima', error: 'no data' }],
    };

    it('manda un correo con todos los adjuntos incluidos y menciona los que fallaron', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'msg-pkg' } });
      const buildDocumentPackage = jest.fn().mockResolvedValue(PACKAGE_RESULT);
      const { controller, audit } = makeController(hubCall, undefined, buildDocumentPackage);

      const result = await controller.sendPackage('10794', { to: 'x@oben.com' });

      expect(buildDocumentPackage).toHaveBeenCalledWith(10794);
      expect(result.sent).toBe(true);
      expect(result.included).toEqual(['consumo_me', 'empaque_solefilmes']);
      expect(result.failed).toEqual([{ key: 'consumo_mp', error: 'no data' }]);
      const emailArgs = hubCall.mock.calls[0][2];
      expect(emailArgs.to).toBe('x@oben.com');
      expect(emailArgs.attachments).toHaveLength(2);
      expect(emailArgs.attachments[1].contentType).toBe('application/pdf');
      expect(emailArgs.body).toContain('Consumo de Materia Prima');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'document_package_sent' }));
    });

    it('sin destinatario, resuelve la lista de distribución asociada a document_package', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'msg-pkg' } });
      const buildDocumentPackage = jest.fn().mockResolvedValue(PACKAGE_RESULT);
      const resolveRecipients = jest.fn().mockResolvedValue({ to: ['a@oben.com', 'b@oben.com'], cc: ['c@oben.com'], bcc: [] });
      const { controller } = makeController(hubCall, resolveRecipients, buildDocumentPackage);

      const result = await controller.sendPackage('10794', {});

      expect(resolveRecipients).toHaveBeenCalledWith('document', 'document_package');
      expect(result.to).toBe('a@oben.com');
      expect(result.cc).toEqual(['b@oben.com', 'c@oben.com']);
    });

    it('sin destinatario y sin lista de distribución asociada, rechaza sin enviar', async () => {
      const hubCall = jest.fn();
      const buildDocumentPackage = jest.fn().mockResolvedValue(PACKAGE_RESULT);
      const { controller } = makeController(hubCall, undefined, buildDocumentPackage);

      await expect(controller.sendPackage('10794', {})).rejects.toThrow(BadRequestException);
      expect(hubCall).not.toHaveBeenCalled();
    });

    it('si ningún reporte se pudo consultar, rechaza sin llamar a enviar correo', async () => {
      const hubCall = jest.fn();
      const buildDocumentPackage = jest.fn().mockResolvedValue(EMPTY_PACKAGE);
      const { controller } = makeController(hubCall, undefined, buildDocumentPackage);

      await expect(controller.sendPackage('10794', { to: 'x@oben.com' })).rejects.toThrow(BadRequestException);
      expect(hubCall).not.toHaveBeenCalledWith('email', 'send', expect.anything());
    });
  });
});
