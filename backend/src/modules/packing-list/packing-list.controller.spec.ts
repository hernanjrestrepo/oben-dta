import { BadRequestException } from '@nestjs/common';
import { PackingListController } from './packing-list.controller';
import { REQUIRE_PERMISSION_KEY } from '../security/require-permission.decorator';

function makeController(hubCall: jest.Mock, resolveRecipients?: jest.Mock) {
  const hub = { call: hubCall } as any;
  const ctx = { userId: 'u1', tenantId: 't1' } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const distributionLists = {
    resolveRecipients: resolveRecipients ?? jest.fn().mockResolvedValue({ to: [], cc: [], bcc: [] }),
  } as any;
  const excel = { build: jest.fn().mockReturnValue(Buffer.from('fake-xlsx')) } as any;
  const automation = {
    listCarteraHolds: jest.fn().mockResolvedValue([]),
    releaseCarteraHold: jest.fn().mockResolvedValue({}),
    cancelCarteraHold: jest.fn().mockResolvedValue({}),
  } as any;
  return {
    automation,
    controller: new PackingListController(hub, ctx, audit, distributionLists, excel, automation),
    audit,
    distributionLists,
    excel,
  };
}

const SAMPLE_DATA = {
  Cliente: 'ETIQUETAS Y CAPSULAS DE COLOMBIA ETICAP SA',
  Documento: 'Guia_Venta',
  Numero: '10982',
  Fecha: '2026-08-31',
  Almacen: 'P1 - Almacen Despacho',
  DetailedPackingList: [
    { Descripcion: 'OPET PLAIN FILM ET12 RT', Lote: '354412', BobinaPesoNetoKg: 216.1, PaletaPesoNetoKg: 449.7, PaletaPesoBrutoKg: 500.6 },
  ],
};

describe('PackingListController', () => {
  describe('GET :numberOrderSales', () => {
    it('consulta query.run con spPackingListUSA_Paradixe y devuelve los datos', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: SAMPLE_DATA });
      const { controller } = makeController(hubCall);

      const result = await controller.getByOrderNumber('10794');

      expect(result).toEqual(SAMPLE_DATA);
      // Lectura contra la API real de Oben: OBEN_QUERY_OPTIONS (sin reintentos
      // automáticos — la API no soporta llamadas concurrentes).
      expect(hubCall).toHaveBeenCalledWith(
        'obenCostOrder',
        'query.run',
        { procedure: 'spPackingListUSA_Paradixe', numberOrderSales: 10794 },
        { maxAttempts: 1, timeoutMs: 30_000 },
      );
    });

    it('rechaza un numberOrderSales inválido sin llamar al hub', async () => {
      const hubCall = jest.fn();
      const { controller } = makeController(hubCall);
      await expect(controller.getByOrderNumber('abc')).rejects.toThrow(BadRequestException);
      expect(hubCall).not.toHaveBeenCalled();
    });

    it('rechaza un número de orden no entero (antes 10794.5 llegaba a Oben)', async () => {
      const hubCall = jest.fn();
      const { controller } = makeController(hubCall);
      await expect(controller.getByOrderNumber('10794.5')).rejects.toThrow(BadRequestException);
      expect(hubCall).not.toHaveBeenCalled();
    });

    it('propaga el error si Oben no responde', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: false, error: 'unreachable' });
      const { controller } = makeController(hubCall);
      await expect(controller.getByOrderNumber('10794')).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET :numberOrderSales/excel', () => {
    it('consulta en vivo, construye el .xlsx y lo devuelve como descarga', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: SAMPLE_DATA });
      const { controller, excel } = makeController(hubCall);
      const res = { setHeader: jest.fn(), send: jest.fn() } as any;

      await controller.downloadExcel('10794', res);

      expect(excel.build).toHaveBeenCalledWith('Lista de Empaque', 10794, SAMPLE_DATA, 'packing_list');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('Lista_de_Empaque-OV10794.xlsx'),
      );
      expect(res.send).toHaveBeenCalledWith(Buffer.from('fake-xlsx'));
    });
  });

  describe('POST :numberOrderSales/send', () => {
    it('reconsulta en vivo, adjunta el .xlsx real y audita el envío', async () => {
      const hubCall = jest.fn()
        .mockResolvedValueOnce({ ok: true, data: SAMPLE_DATA }) // query.run
        .mockResolvedValueOnce({ ok: true, data: { id: 'msg-1' } }); // email.send
      const { controller, audit, excel } = makeController(hubCall);

      const result = await controller.sendByEmail('10794', { to: 'cliente@ejemplo.com' });

      expect(result).toEqual({ sent: true, to: 'cliente@ejemplo.com', cc: [] });
      expect(excel.build).toHaveBeenCalledWith('Lista de Empaque', 10794, SAMPLE_DATA, 'packing_list');
      const emailCallArgs = hubCall.mock.calls[1];
      expect(emailCallArgs[0]).toBe('email');
      expect(emailCallArgs[1]).toBe('send');
      expect(emailCallArgs[2].to).toBe('cliente@ejemplo.com');
      expect(emailCallArgs[2].subject).toContain('10794');
      expect(emailCallArgs[2].attachments).toEqual([
        expect.objectContaining({
          filename: 'Lista_de_Empaque-OV10794.xlsx',
          content: Buffer.from('fake-xlsx').toString('base64'),
          encoding: 'base64',
        }),
      ]);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'email_sent', outputData: expect.objectContaining({ ok: true }) }),
      );
    });

    it('lanza BadRequestException y audita el fallo si el envío de correo falla', async () => {
      const hubCall = jest.fn()
        .mockResolvedValueOnce({ ok: true, data: SAMPLE_DATA })
        .mockResolvedValueOnce({ ok: false, error: 'smtp_down' });
      const { controller, audit } = makeController(hubCall);

      await expect(controller.sendByEmail('10794', { to: 'cliente@ejemplo.com' })).rejects.toThrow(
        BadRequestException,
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'smtp_down' }),
      );
    });

    it('no llama a enviar correo si la consulta a Oben falla primero', async () => {
      const hubCall = jest.fn().mockResolvedValueOnce({ ok: false, error: 'unreachable' });
      const { controller } = makeController(hubCall);

      await expect(controller.sendByEmail('10794', { to: 'cliente@ejemplo.com' })).rejects.toThrow(
        BadRequestException,
      );
      expect(hubCall).toHaveBeenCalledTimes(1);
    });

    it('sin destinatario explícito, resuelve con la lista de distribución asociada a packing_list', async () => {
      const hubCall = jest.fn()
        .mockResolvedValueOnce({ ok: true, data: SAMPLE_DATA })
        .mockResolvedValueOnce({ ok: true, data: { id: 'msg-2' } });
      const resolveRecipients = jest.fn().mockResolvedValue({
        to: ['principal@oben.com', 'segundo@oben.com'],
        cc: ['copia@paradixe.co'],
        bcc: [],
      });
      const { controller } = makeController(hubCall, resolveRecipients);

      const result = await controller.sendByEmail('10794', {});

      expect(resolveRecipients).toHaveBeenCalledWith('document', 'packing_list');
      expect(result).toEqual({
        sent: true,
        to: 'principal@oben.com',
        cc: ['segundo@oben.com', 'copia@paradixe.co'],
      });
      const emailCallArgs = hubCall.mock.calls[1];
      expect(emailCallArgs[2].to).toBe('principal@oben.com');
      expect(emailCallArgs[2].cc).toBe('segundo@oben.com,copia@paradixe.co');
    });

    it('sin destinatario explícito y sin lista de distribución asociada, rechaza sin llamar al hub de correo', async () => {
      const hubCall = jest.fn().mockResolvedValueOnce({ ok: true, data: SAMPLE_DATA });
      const resolveRecipients = jest.fn().mockResolvedValue({ to: [], cc: [], bcc: [] });
      const { controller } = makeController(hubCall, resolveRecipients);

      await expect(controller.sendByEmail('10794', {})).rejects.toThrow(BadRequestException);
      expect(hubCall).toHaveBeenCalledTimes(1); // solo query.run, nunca email.send
    });
  });

  describe('retenciones por cartera (regla PND)', () => {
    it('listar exige orders.read; liberar/cancelar exigen orders.update y validan la OV', async () => {
      const { controller, automation } = makeController(jest.fn());
      const perm = (name: keyof PackingListController) =>
        JSON.stringify(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, PackingListController.prototype[name]));
      expect(perm('listCarteraHolds')).toContain('orders.read');
      expect(perm('releaseCarteraHold')).toContain('orders.update');
      expect(perm('cancelCarteraHold')).toContain('orders.update');

      await controller.listCarteraHolds();
      expect(automation.listCarteraHolds).toHaveBeenCalled();
      await controller.releaseCarteraHold('10824', { motivo: 'Cartera confirmó' });
      expect(automation.releaseCarteraHold).toHaveBeenCalledWith(10824, 'Cartera confirmó');
      await controller.cancelCarteraHold('10824', { motivo: 'Pedido dado de baja' });
      expect(automation.cancelCarteraHold).toHaveBeenCalledWith(10824, 'Pedido dado de baja');
      expect(() => controller.releaseCarteraHold('abc', { motivo: 'x' })).toThrow(BadRequestException);
    });
  });
});
