import { BadRequestException } from '@nestjs/common';
import { PackingListAutomationService } from './packing-list-automation.service';

const COMPLETE_PACKAGE = {
  client: 'SOLEFILMES IMPORTACAO DISTRIBUICAO E LOGISTICA LTDA',
  included: [
    { key: 'lista_especial', label: 'Lista Especial', filename: 'Lista_Especial-OV10824.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('a') },
    { key: 'empaque_solefilmes', label: 'Empaque Solefilmes', filename: 'Shipment_Traceability-OV10824.pdf', contentType: 'application/pdf', buffer: Buffer.from('b') },
  ],
  failed: [],
};

const INCOMPLETE_PACKAGE = {
  client: 'ETIQUETAS Y CAPSULAS DE COLOMBIA ETICAP SA',
  included: [
    { key: 'lista_especial', label: 'Lista Especial', filename: 'Lista_Especial-OV10982.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('a') },
  ],
  failed: [{ key: 'consumo_mp', label: 'Consumo de Materia Prima', error: 'no data' }],
};

const TOTAL_FAILURE_PACKAGE = {
  client: '',
  included: [],
  failed: [{ key: 'lista_especial', label: 'Lista Especial', error: 'no se pudo consultar la lista de empaque' }],
};

function makeService(
  hubCall: jest.Mock,
  resolveRecipients?: jest.Mock,
  buildDocumentPackage?: jest.Mock,
  confirmApproveComex?: jest.Mock,
  retriesOverrides?: Partial<Record<'findOne' | 'create' | 'save' | 'update', jest.Mock>>,
) {
  const hub = { call: hubCall } as any;
  const ctx = { userId: 'u1', tenantId: 't1' } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const distributionLists = {
    resolveRecipients: resolveRecipients ?? jest.fn().mockResolvedValue({ to: ['ops@oben.com'], cc: [], bcc: [] }),
  } as any;
  const reports = {
    buildDocumentPackage: buildDocumentPackage ?? jest.fn().mockResolvedValue(COMPLETE_PACKAGE),
    confirmApproveComex: confirmApproveComex ?? jest.fn().mockResolvedValue({ ok: true }),
  } as any;
  const retries = {
    findOne: retriesOverrides?.findOne ?? jest.fn().mockResolvedValue(null),
    create: retriesOverrides?.create ?? jest.fn((x: unknown) => x),
    save: retriesOverrides?.save ?? jest.fn().mockResolvedValue(undefined),
    update: retriesOverrides?.update ?? jest.fn().mockResolvedValue(undefined),
  } as any;
  return {
    service: new PackingListAutomationService(hub, ctx, audit, distributionLists, reports, retries),
    audit,
    reports,
    retries,
  };
}

describe('PackingListAutomationService', () => {
  describe('handleOvApproved — paquete completo', () => {
    it('cuando el paquete está completo (sin fallos), manda el correo de inmediato', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'msg-2' } });
      const buildDocumentPackage = jest.fn().mockResolvedValue(COMPLETE_PACKAGE);
      const { service, reports } = makeService(hubCall, undefined, buildDocumentPackage);

      const result = await service.handleOvApproved(10824);

      expect(result).toEqual({
        sent: true,
        queued: false,
        client: COMPLETE_PACKAGE.client,
        included: ['lista_especial', 'empaque_solefilmes'],
        failed: [],
      });
      const emailArgs = hubCall.mock.calls[0][2];
      expect(emailArgs.subject).toBe('Lista de Empaque — Orden 10824 (Solefilmes)');
      expect(emailArgs.body).not.toContain('No se pudieron incluir');
      expect(reports.confirmApproveComex).toHaveBeenCalledWith(10824);
    });
  });

  describe('handleOvApproved — paquete incompleto (2026-09-14: nunca se manda incompleto)', () => {
    it('si falta algo, NO manda ningún correo — encola la orden para reintento', async () => {
      const hubCall = jest.fn();
      const buildDocumentPackage = jest.fn().mockResolvedValue(INCOMPLETE_PACKAGE);
      const { service, audit, retries, reports } = makeService(hubCall, undefined, buildDocumentPackage);

      const result = await service.handleOvApproved(10982);

      expect(hubCall).not.toHaveBeenCalled();
      expect(reports.confirmApproveComex).not.toHaveBeenCalled();
      expect(result).toEqual({
        sent: false,
        queued: true,
        client: INCOMPLETE_PACKAGE.client,
        included: ['lista_especial'],
        failed: ['consumo_mp'],
      });
      expect(retries.save).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't1', numberOrderSales: 10982, status: 'pending', attempts: 0 }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ov_approved_incompleto_en_cola' }),
      );
    });

    it('si TODO falla (0 documentos generados), también se encola en vez de rechazar de inmediato', async () => {
      const hubCall = jest.fn();
      const buildDocumentPackage = jest.fn().mockResolvedValue(TOTAL_FAILURE_PACKAGE);
      const { service, retries } = makeService(hubCall, undefined, buildDocumentPackage);

      const result = await service.handleOvApproved(10982);

      expect(hubCall).not.toHaveBeenCalled();
      expect(result.queued).toBe(true);
      expect(retries.save).toHaveBeenCalled();
    });

    it('si ya hay un reintento "pending" para esa orden, no encola uno duplicado', async () => {
      const hubCall = jest.fn();
      const buildDocumentPackage = jest.fn().mockResolvedValue(INCOMPLETE_PACKAGE);
      const findOne = jest.fn().mockResolvedValue({ id: 'existing-row' });
      const save = jest.fn();
      const { service } = makeService(hubCall, undefined, buildDocumentPackage, undefined, { findOne, save });

      await service.handleOvApproved(10982);

      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('handleOvApproved — sin lista de distribución', () => {
    it('rechaza sin siquiera consultar Oben (falla rápido por configuración, no por datos)', async () => {
      const resolveRecipients = jest.fn().mockResolvedValue({ to: [], cc: [], bcc: [] });
      const hubCall = jest.fn();
      const buildDocumentPackage = jest.fn();
      const { service, audit } = makeService(hubCall, resolveRecipients, buildDocumentPackage);

      await expect(service.handleOvApproved(10982)).rejects.toThrow(BadRequestException);
      expect(buildDocumentPackage).not.toHaveBeenCalled();
      expect(hubCall).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ov_approved_sin_lista_distribucion' }),
      );
    });
  });

  describe('sendCompletePackage', () => {
    it('si el correo no se pudo enviar, no confirma spApproveComex', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: false, error: 'smtp down' });
      const { service, reports } = makeService(hubCall);

      await expect(
        service.sendCompletePackage(10982, COMPLETE_PACKAGE as any, { to: ['ops@oben.com'], cc: [], bcc: [] }),
      ).rejects.toThrow(BadRequestException);
      expect(reports.confirmApproveComex).not.toHaveBeenCalled();
    });
  });

  describe('sendEscalation (tras 5 intentos fallidos)', () => {
    it('manda el correo de escalamiento a la lista "packing_list_escalation"', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'msg-esc' } });
      const resolveRecipients = jest.fn().mockResolvedValue({
        to: ['joseguzman@obengroup.com'],
        cc: ['jorgerestrepo@obengroup.com'],
        bcc: [],
      });
      const { service, audit } = makeService(hubCall, resolveRecipients);

      await service.sendEscalation(10982, [{ key: 'consumo_mp', label: 'Consumo de Materia Prima', error: 'no data' }]);

      expect(resolveRecipients).toHaveBeenCalledWith('document', 'packing_list_escalation');
      const emailArgs = hubCall.mock.calls[0][2];
      expect(emailArgs.to).toBe('joseguzman@obengroup.com');
      expect(emailArgs.cc).toBe('jorgerestrepo@obengroup.com');
      expect(emailArgs.subject).toBe('Orden 10982 — documentos incompletos tras 5 intentos');
      expect(emailArgs.body).toContain('Consumo de Materia Prima');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ov_approved_escalado_tras_5_intentos' }),
      );
    });

    it('sin lista "packing_list_escalation" configurada, audita el problema pero no lanza', async () => {
      const hubCall = jest.fn();
      const resolveRecipients = jest.fn().mockResolvedValue({ to: [], cc: [], bcc: [] });
      const { service, audit } = makeService(hubCall, resolveRecipients);

      await expect(
        service.sendEscalation(10982, [{ key: 'consumo_mp', label: 'Consumo de Materia Prima', error: 'no data' }]),
      ).resolves.toBeUndefined();
      expect(hubCall).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ov_approved_escalamiento_sin_lista_distribucion' }),
      );
    });
  });
});
