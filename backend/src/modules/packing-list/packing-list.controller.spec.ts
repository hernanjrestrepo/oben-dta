import { BadRequestException } from '@nestjs/common';
import { PackingListController } from './packing-list.controller';

function makeController(hubCall: jest.Mock, resolveRecipients?: jest.Mock) {
  const hub = { call: hubCall } as any;
  const ctx = { userId: 'u1', tenantId: 't1' } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const distributionLists = {
    resolveRecipients: resolveRecipients ?? jest.fn().mockResolvedValue({ to: [], cc: [], bcc: [] }),
  } as any;
  return {
    controller: new PackingListController(hub, ctx, audit, distributionLists),
    audit,
    distributionLists,
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
      expect(hubCall).toHaveBeenCalledWith('obenCostOrder', 'query.run', {
        procedure: 'spPackingListUSA_Paradixe',
        numberOrderSales: 10794,
      });
    });

    it('rechaza un numberOrderSales inválido sin llamar al hub', async () => {
      const hubCall = jest.fn();
      const { controller } = makeController(hubCall);
      await expect(controller.getByOrderNumber('abc')).rejects.toThrow(BadRequestException);
      expect(hubCall).not.toHaveBeenCalled();
    });

    it('propaga el error si Oben no responde', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: false, error: 'unreachable' });
      const { controller } = makeController(hubCall);
      await expect(controller.getByOrderNumber('10794')).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST :numberOrderSales/send', () => {
    it('reconsulta en vivo, envía el correo real y audita el envío', async () => {
      const hubCall = jest.fn()
        .mockResolvedValueOnce({ ok: true, data: SAMPLE_DATA }) // query.run
        .mockResolvedValueOnce({ ok: true, data: { id: 'msg-1' } }); // email.send
      const { controller, audit } = makeController(hubCall);

      const result = await controller.sendByEmail('10794', { to: 'cliente@ejemplo.com' });

      expect(result).toEqual({ sent: true, to: 'cliente@ejemplo.com', cc: [] });
      expect(hubCall).toHaveBeenNthCalledWith(1, 'obenCostOrder', 'query.run', {
        procedure: 'spPackingListUSA_Paradixe',
        numberOrderSales: 10794,
      });
      const emailCallArgs = hubCall.mock.calls[1];
      expect(emailCallArgs[0]).toBe('email');
      expect(emailCallArgs[1]).toBe('send');
      expect(emailCallArgs[2].to).toBe('cliente@ejemplo.com');
      expect(emailCallArgs[2].subject).toContain('10794');
      expect(emailCallArgs[2].body).toContain('ETIQUETAS Y CAPSULAS');
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
});
