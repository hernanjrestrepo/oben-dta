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
  carteraEvaluar?: jest.Mock,
) {
  const hub = { call: hubCall } as any;
  const ctx = { userId: 'u1', tenantId: 't1' } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined), listForEntity: jest.fn().mockResolvedValue([]) } as any;
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
  // Default: cartera liberada y verificada con una fuente real — el flujo de
  // siempre. La regla PND tiene sus propias pruebas abajo.
  const cartera = {
    evaluar: carteraEvaluar ?? jest.fn().mockResolvedValue({ action: 'continuar', verificada: true, simulated: false, motivo: 'Cartera liberada.' }),
  } as any;
  return {
    service: new PackingListAutomationService(hub, ctx, audit, distributionLists, reports, retries, cartera),
    audit,
    reports,
    retries,
    cartera,
    distributionLists,
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

  describe('handleOvApproved — el paquete está completo pero el ENVÍO falla (2026-09-17: OV 11040, timeout de SMTP)', () => {
    it('no lanza ni pierde la orden — la encola igual que un paquete incompleto', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: false, error: 'timeout: sin respuesta de "email.send" tras 30000ms' });
      const buildDocumentPackage = jest.fn().mockResolvedValue(COMPLETE_PACKAGE);
      const { service, audit, retries, reports } = makeService(hubCall, undefined, buildDocumentPackage);

      const result = await service.handleOvApproved(10824);

      expect(result).toEqual({
        sent: false,
        queued: true,
        client: COMPLETE_PACKAGE.client,
        included: ['lista_especial', 'empaque_solefilmes'],
        failed: [],
      });
      expect(reports.confirmApproveComex).not.toHaveBeenCalled();
      expect(retries.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't1',
          numberOrderSales: 10824,
          status: 'pending',
          lastMissing: [{ key: 'envio_correo', label: 'Envío del correo electrónico', error: 'timeout: sin respuesta de "email.send" tras 30000ms' }],
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ov_approved_envio_fallido_en_cola' }),
      );
    });
  });

  describe('recoverInterruptedOv (2026-09-23: cron reiniciaba el contenedor cada 2 min, OV 10983 y 11147 quedaron en processing)', () => {
    const since = new Date('2026-09-22T10:00:00Z');

    it('si NO hay envío auditado desde el corte, encola la orden ya mismo (sin esperar 10 min) para que el reintento en segundo plano la envíe', async () => {
      const { service, audit, retries } = makeService(jest.fn());

      const outcome = await service.recoverInterruptedOv(10983, since);

      expect(outcome).toBe('queued');
      const saved = (retries.save as jest.Mock).mock.calls[0][0];
      expect(saved).toEqual(expect.objectContaining({ tenantId: 't1', numberOrderSales: 10983, status: 'pending' }));
      expect(saved.nextRetryAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ov_approved_recuperada_tras_reinicio' }));
    });

    it('si YA hay un envío real auditado desde el corte, NO encola nada (evita duplicar el correo)', async () => {
      const { service, audit, retries } = makeService(jest.fn());
      (audit.listForEntity as jest.Mock).mockResolvedValue([
        { action: 'ov_approved_lista_empaque_enviada', createdAt: new Date('2026-09-22T10:03:00Z') },
      ]);

      const outcome = await service.recoverInterruptedOv(10983, since);

      expect(outcome).toBe('already_sent');
      expect(retries.save).not.toHaveBeenCalled();
    });

    it('un intento de envío FALLIDO (auditado con ok:false) no cuenta como enviado — antes la OV se perdía', async () => {
      const { service, audit, retries } = makeService(jest.fn());
      (audit.listForEntity as jest.Mock).mockResolvedValue([
        { action: 'ov_approved_lista_empaque_enviada', outputData: { ok: false }, createdAt: new Date('2026-09-22T10:03:00Z') },
      ]);

      expect(await service.recoverInterruptedOv(10983, since)).toBe('queued');
      expect(retries.save).toHaveBeenCalledWith(expect.objectContaining({ numberOrderSales: 10983, status: 'pending' }));
    });

    it('un envío auditado sin el campo ok (histórico) sigue contando como enviado — ante la duda, no duplicar', async () => {
      const { service, audit, retries } = makeService(jest.fn());
      (audit.listForEntity as jest.Mock).mockResolvedValue([
        { action: 'ov_approved_lista_empaque_enviada', outputData: null, createdAt: new Date('2026-09-22T10:03:00Z') },
      ]);

      expect(await service.recoverInterruptedOv(10983, since)).toBe('already_sent');
      expect(retries.save).not.toHaveBeenCalled();
    });

    it('un envío auditado ANTERIOR al corte (otro correo de la misma OV) no cuenta como ya enviado', async () => {
      const { service, audit, retries } = makeService(jest.fn());
      (audit.listForEntity as jest.Mock).mockResolvedValue([
        { action: 'ov_approved_lista_empaque_enviada', createdAt: new Date('2026-09-20T10:03:00Z') },
      ]);

      expect(await service.recoverInterruptedOv(10983, since)).toBe('queued');
      expect(retries.save).toHaveBeenCalled();
    });
  });

  describe('handleOvApproved — cola de reintentos', () => {
    it('un envío directo exitoso cierra el reintento pendiente de la misma OV (si no, el procesador la reenviaba)', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'msg-2' } });
      const { service, retries } = makeService(hubCall);

      await service.handleOvApproved(10824);

      expect(retries.update).toHaveBeenCalledWith(
        { tenantId: 't1', numberOrderSales: 10824, status: 'pending' },
        { status: 'completed', lastMissing: null },
      );
    });

    it('si cerrar el reintento pendiente falla (BD), el envío ya hecho se sigue reportando como enviado', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'msg-2' } });
      const update = jest.fn().mockRejectedValue(new Error('db caída'));
      const { service } = makeService(hubCall, undefined, undefined, undefined, { update });

      await expect(service.handleOvApproved(10824)).resolves.toMatchObject({ sent: true, queued: false });
    });

    it('si el envío directo falla, NO cierra ningún reintento pendiente', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: false, error: 'smtp down' });
      const { service, retries } = makeService(hubCall);

      await service.handleOvApproved(10824);

      expect(retries.update).not.toHaveBeenCalled();
    });

    it('si otro encolado simultáneo ganó el índice único (23505), la orden igual queda en cola: no lanza', async () => {
      const save = jest.fn().mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
      const buildDocumentPackage = jest.fn().mockResolvedValue(INCOMPLETE_PACKAGE);
      const { service } = makeService(jest.fn(), undefined, buildDocumentPackage, undefined, { save });

      await expect(service.handleOvApproved(10982)).resolves.toMatchObject({ queued: true, sent: false });
    });

    it('cualquier otro error al encolar SÍ se propaga (el llamador lo registra como fallido, no se pierde en silencio)', async () => {
      const save = jest.fn().mockRejectedValue(Object.assign(new Error('connection terminated'), { code: '57P01' }));
      const buildDocumentPackage = jest.fn().mockResolvedValue(INCOMPLETE_PACKAGE);
      const { service } = makeService(jest.fn(), undefined, buildDocumentPackage, undefined, { save });

      await expect(service.handleOvApproved(10982)).rejects.toThrow('connection terminated');
    });

    it('el envío fallido se audita (ok:false) ANTES de encolar, con el motivo real', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: false, error: 'smtp down' });
      const { service, audit, retries } = makeService(hubCall);

      await service.handleOvApproved(10824);

      const sentLog = (audit.log as jest.Mock).mock.calls.find((c) => c[0].action === 'ov_approved_lista_empaque_enviada')[0];
      expect(sentLog).toMatchObject({ outputData: expect.objectContaining({ ok: false }), reason: 'smtp down' });
      expect(retries.save).toHaveBeenCalled();
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
    it('si el correo no se pudo enviar, no confirma spApproveComex y devuelve sendFailure en vez de lanzar', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: false, error: 'smtp down' });
      const { service, reports } = makeService(hubCall);

      const result = await service.sendCompletePackage(10982, COMPLETE_PACKAGE as any, { to: ['ops@oben.com'], cc: [], bcc: [] });

      expect(result.sent).toBe(false);
      expect(result.sendFailure).toEqual({ key: 'envio_correo', label: 'Envío del correo electrónico', error: 'smtp down' });
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

  describe('regla PND — cartera no ha liberado (reunión 2026-09-23)', () => {
    const RETENER = { action: 'retener', pnd: true, simulated: false, motivo: 'Cartera no ha liberado la orden (PND).', observacion: 'Sin cupo' };
    const listas = (map: Record<string, string[]>) =>
      jest.fn(async (_t: string, key: string) => ({ to: map[key] ?? [], cc: [], bcc: [] }));

    it('no genera ningún documento, no confirma ApproveComex, retiene la OV 6 horas y avisa a packing_list_cartera', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'aviso-1' } });
      const resolve = listas({ packing_list: ['ops@oben.com'], packing_list_cartera: ['cartera@oben.com', 'cs@oben.com'] });
      const { service, reports, retries, audit } = makeService(hubCall, resolve, undefined, undefined, undefined, jest.fn().mockResolvedValue(RETENER));

      const before = Date.now();
      const result = await service.handleOvApproved(10824);

      expect(result).toMatchObject({ sent: false, queued: true, held: true, carteraMotivo: RETENER.motivo });
      expect(reports.buildDocumentPackage).not.toHaveBeenCalled();
      expect(reports.confirmApproveComex).not.toHaveBeenCalled();
      const saved = retries.create.mock.calls[0][0];
      expect(saved).toMatchObject({ numberOrderSales: 10824, kind: 'cartera', status: 'pending', attempts: 0, holdReason: RETENER.motivo });
      expect(saved.nextRetryAt.getTime() - before).toBeGreaterThanOrEqual(6 * 60 * 60_000 - 1000);

      expect(hubCall).toHaveBeenCalledTimes(1);
      const [, , email] = hubCall.mock.calls[0];
      expect(email).toMatchObject({ to: 'cartera@oben.com', cc: 'cs@oben.com' });
      expect(email.subject).toBe('Orden 10824 — retenida por cartera: la Lista de Empaque no se genera');
      expect(email.body).toContain('Producir No Despachar');
      expect(email.body).toContain('Sin cupo');
      expect(email.body).toContain('cada 6 horas');
      expect(audit.log.mock.calls.map((c: any[]) => c[0].action)).toEqual(['ov_approved_retenida_por_cartera', 'ov_cartera_aviso_enviado']);
    });

    it('sin lista packing_list_cartera avisa a packing_list_escalation; sin ninguna, lo audita y no envía', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'x' } });
      const a = makeService(hubCall, listas({ packing_list: ['ops@oben.com'], packing_list_escalation: ['jose@oben.com'] }), undefined, undefined, undefined, jest.fn().mockResolvedValue(RETENER));
      await a.service.handleOvApproved(10824);
      expect(hubCall.mock.calls[0][2].to).toBe('jose@oben.com');

      const hubCall2 = jest.fn();
      const b = makeService(hubCall2, listas({ packing_list: ['ops@oben.com'] }), undefined, undefined, undefined, jest.fn().mockResolvedValue(RETENER));
      await b.service.handleOvApproved(10824);
      expect(hubCall2).not.toHaveBeenCalled();
      expect(b.audit.log.mock.calls.map((c: any[]) => c[0].action)).toContain('ov_cartera_aviso_sin_lista_distribucion');
    });

    it('un segundo "Aprobada en Corte" de una OV ya retenida no duplica la fila ni el aviso', async () => {
      const hubCall = jest.fn();
      const existing = { id: 'row-9', numberOrderSales: 10824, kind: 'cartera', attempts: 2, status: 'pending' };
      const { service, retries } = makeService(
        hubCall,
        listas({ packing_list: ['ops@oben.com'], packing_list_cartera: ['c@oben.com'] }),
        undefined,
        undefined,
        { findOne: jest.fn().mockResolvedValue(existing) },
        jest.fn().mockResolvedValue(RETENER),
      );
      await service.handleOvApproved(10824);
      expect(retries.save).not.toHaveBeenCalled();
      expect(retries.update).toHaveBeenCalledWith('row-9', expect.objectContaining({ kind: 'cartera', attempts: 2 }));
      expect(hubCall).not.toHaveBeenCalled();
    });

    it('si la fuente real de cartera falla: retiene, re-verifica en 10 minutos y avisa una sola vez', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'x' } });
      const reintentar = { action: 'reintentar', simulated: false, motivo: 'No se pudo consultar cartera en OBEN MAS: HTTP 500' };
      const { service, retries } = makeService(hubCall, listas({ packing_list: ['ops@oben.com'], packing_list_cartera: ['c@oben.com'] }), undefined, undefined, undefined, jest.fn().mockResolvedValue(reintentar));
      const before = Date.now();
      await service.handleOvApproved(10824);
      const saved = retries.create.mock.calls[0][0];
      expect(saved.nextRetryAt.getTime() - before).toBeLessThan(11 * 60_000);
      expect(hubCall.mock.calls[0][2].body).toContain('HTTP 500');

      // Re-verificación desde el procesador (sigue fallando): no vuelve a avisar.
      hubCall.mockClear();
      const gate = await service.carteraGate(10824, { id: 'r', kind: 'cartera', attempts: 0 } as any);
      expect(gate.proceed).toBe(false);
      expect(hubCall).not.toHaveBeenCalled();
    });

    it('re-verificación a las 6 h que sigue retenida: suma la verificación y vuelve a avisar', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'x' } });
      const { service, retries } = makeService(hubCall, listas({ packing_list_cartera: ['c@oben.com'] }), undefined, undefined, undefined, jest.fn().mockResolvedValue(RETENER));
      const gate = await service.carteraGate(10824, { id: 'row-1', kind: 'cartera', attempts: 1 } as any);
      expect(gate.proceed).toBe(false);
      expect(retries.update).toHaveBeenCalledWith('row-1', expect.objectContaining({ attempts: 2, kind: 'cartera' }));
      expect(hubCall.mock.calls[0][2].body).toContain('verificación n.º 3');
    });

    it('cuando cartera libera, la fila pasa a "incompleto" con intentos en cero y el flujo sigue', async () => {
      const { service, retries, audit } = makeService(jest.fn(), undefined, undefined, undefined, undefined, jest.fn().mockResolvedValue({ action: 'continuar', verificada: true, simulated: false, motivo: 'Cartera liberada.' }));
      const gate = await service.carteraGate(10824, { id: 'row-1', kind: 'cartera', attempts: 3 } as any);
      expect(gate).toMatchObject({ proceed: true, resetAttempts: true });
      expect(retries.update).toHaveBeenCalledWith('row-1', { kind: 'incompleto', attempts: 0, holdReason: null, lastMissing: null });
      expect(audit.log.mock.calls[0][0].action).toBe('ov_cartera_liberada');
    });

    it('cartera sin verificar (fuente simulada en producción): sigue el flujo de siempre y lo deja auditado', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'msg' } });
      const noVerificada = { action: 'continuar', verificada: false, simulated: true, motivo: 'Cartera NO verificada: fuente SIMULADA.' };
      const { service, audit, reports } = makeService(hubCall, undefined, undefined, undefined, undefined, jest.fn().mockResolvedValue(noVerificada));
      const result = await service.handleOvApproved(10824);
      expect(result.sent).toBe(true);
      expect(reports.confirmApproveComex).toHaveBeenCalledWith(10824);
      expect(audit.log.mock.calls[0][0]).toMatchObject({ action: 'ov_approved_cartera_no_verificada', reason: noVerificada.motivo });
    });

    it('en un entorno simulado el aviso sale rotulado [SIMULADO]', async () => {
      const hubCall = jest.fn().mockResolvedValue({ ok: true, data: { id: 'x' } });
      const { service } = makeService(hubCall, listas({ packing_list: ['o@x.com'], packing_list_cartera: ['c@x.com'] }), undefined, undefined, undefined, jest.fn().mockResolvedValue({ ...RETENER, simulated: true }));
      await service.handleOvApproved(10824);
      expect(hubCall.mock.calls[0][2].subject).toMatch(/^\[SIMULADO\] /);
      expect(hubCall.mock.calls[0][2].body).toContain('simulador de OBEN MAS');
    });

    describe('liberar / cancelar a mano', () => {
      it('liberar exige que la OV esté retenida; marca override para no re-verificar y lo audita con el motivo', async () => {
        const row = { id: 'row-1', numberOrderSales: 10824, kind: 'cartera', attempts: 1, holdReason: 'PND', status: 'pending' };
        const { service, retries, audit } = makeService(jest.fn(), undefined, undefined, undefined, { findOne: jest.fn().mockResolvedValue(row) });
        const out = await service.releaseCarteraHold(10824, 'Cartera confirmó por correo');
        expect(out).toMatchObject({ kind: 'incompleto', carteraOverride: true });
        expect(retries.update).toHaveBeenCalledWith('row-1', expect.objectContaining({ kind: 'incompleto', carteraOverride: true, attempts: 0 }));
        expect(audit.log.mock.calls[0][0]).toMatchObject({ action: 'ov_cartera_liberada_manual', reason: 'Cartera confirmó por correo' });
      });

      it('cancelar saca la OV de la cola ("cancelled")', async () => {
        const row = { id: 'row-1', numberOrderSales: 10824, kind: 'cartera', attempts: 4, status: 'pending' };
        const { service, retries } = makeService(jest.fn(), undefined, undefined, undefined, { findOne: jest.fn().mockResolvedValue(row) });
        await service.cancelCarteraHold(10824, 'El cliente no pagó: pedido dado de baja');
        expect(retries.update).toHaveBeenCalledWith('row-1', { status: 'cancelled' });
      });

      it('una OV que no está retenida → 404', async () => {
        const { service } = makeService(jest.fn());
        await expect(service.releaseCarteraHold(1, 'x')).rejects.toThrow(/no está retenida por cartera/);
        await expect(service.cancelCarteraHold(1, 'x')).rejects.toThrow(/no está retenida por cartera/);
      });
    });
  });
});
