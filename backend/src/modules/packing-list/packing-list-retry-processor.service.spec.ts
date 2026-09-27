import { PackingListRetryProcessorService } from './packing-list-retry-processor.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { ObenReportsService } from '../oben-reports/oben-reports.service';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { PackingListAutomationService } from './packing-list-automation.service';

const COMPLETE_PACKAGE = { client: 'ACME', included: [{ key: 'lista_especial' }], failed: [] };
const INCOMPLETE_PACKAGE = {
  client: 'ACME',
  included: [],
  failed: [{ key: 'consumo_mp', label: 'Consumo de Materia Prima', error: 'no data' }],
};

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'row-1',
    tenantId: 't1',
    numberOrderSales: 10982,
    attempts: 0,
    nextRetryAt: new Date(Date.now() - 1000),
    status: 'pending',
    lastMissing: null,
    ...overrides,
  } as any;
}

function makeService(opts: {
  buildDocumentPackage?: jest.Mock;
  sendCompletePackage?: jest.Mock;
  sendEscalation?: jest.Mock;
  carteraGate?: jest.Mock;
  resolveRecipients?: jest.Mock;
  findDue?: jest.Mock;
  update?: jest.Mock;
  /** Estado ACTUAL de cada fila al momento de procesarla (default: sigue 'pending'). */
  currentStatus?: Record<string, string>;
}) {
  const tenantCtx = { setContext: jest.fn() };
  const reports = { buildDocumentPackage: opts.buildDocumentPackage ?? jest.fn().mockResolvedValue(COMPLETE_PACKAGE) };
  const distributionLists = {
    resolveRecipients: opts.resolveRecipients ?? jest.fn().mockResolvedValue({ to: ['ops@oben.com'], cc: [], bcc: [] }),
  };
  const automation = {
    sendCompletePackage: opts.sendCompletePackage ?? jest.fn().mockResolvedValue({ sent: true, queued: false }),
    sendEscalation: opts.sendEscalation ?? jest.fn().mockResolvedValue(undefined),
    carteraGate: opts.carteraGate ?? jest.fn().mockResolvedValue({ proceed: true, resetAttempts: false, decision: { action: 'continuar' } }),
  };

  const moduleRef = {
    resolve: jest.fn((type: unknown) => {
      if (type === TenantContext) return Promise.resolve(tenantCtx);
      if (type === ObenReportsService) return Promise.resolve(reports);
      if (type === DistributionListsService) return Promise.resolve(distributionLists);
      if (type === PackingListAutomationService) return Promise.resolve(automation);
      throw new Error(`tipo inesperado en test: ${String(type)}`);
    }),
  } as any;

  const retries = {
    find: opts.findDue ?? jest.fn().mockResolvedValue([makeRow()]),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      status: opts.currentStatus?.[where.id] ?? 'pending',
    })),
    update: opts.update ?? jest.fn().mockResolvedValue(undefined),
  } as any;

  const service = new PackingListRetryProcessorService(retries, moduleRef);
  return { service, tenantCtx, reports, distributionLists, automation, retries };
}

describe('PackingListRetryProcessorService (reintento de Lista de Empaque, pedido 2026-09-14)', () => {
  it('si al reintentar el paquete ya está completo, manda el correo real y marca la fila "completed"', async () => {
    const buildDocumentPackage = jest.fn().mockResolvedValue(COMPLETE_PACKAGE);
    const { service, automation, retries, tenantCtx } = makeService({ buildDocumentPackage });

    await service.processDueRetries();

    expect(tenantCtx.setContext).toHaveBeenCalledWith('t1', null, false);
    expect(automation.sendCompletePackage).toHaveBeenCalledWith(10982, COMPLETE_PACKAGE, { to: ['ops@oben.com'], cc: [], bcc: [] });
    expect(retries.update).toHaveBeenCalledWith('row-1', { status: 'completed', lastMissing: null });
    expect(automation.sendEscalation).not.toHaveBeenCalled();
  });

  it('si sigue incompleto y aún no llega a 5 intentos, reprograma +10 minutos sin enviar ni escalar', async () => {
    const buildDocumentPackage = jest.fn().mockResolvedValue(INCOMPLETE_PACKAGE);
    const row = makeRow({ attempts: 1 });
    const { service, automation, retries } = makeService({ buildDocumentPackage, findDue: jest.fn().mockResolvedValue([row]) });

    await service.processDueRetries();

    expect(automation.sendCompletePackage).not.toHaveBeenCalled();
    expect(automation.sendEscalation).not.toHaveBeenCalled();
    expect(retries.update).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({ attempts: 2, lastMissing: INCOMPLETE_PACKAGE.failed }),
    );
  });

  it('en el 5to intento fallido, escala a José/Jorge y marca la fila "escalated" en vez de seguir reintentando', async () => {
    const buildDocumentPackage = jest.fn().mockResolvedValue(INCOMPLETE_PACKAGE);
    const row = makeRow({ attempts: 4 });
    const { service, automation, retries } = makeService({ buildDocumentPackage, findDue: jest.fn().mockResolvedValue([row]) });

    await service.processDueRetries();

    expect(automation.sendEscalation).toHaveBeenCalledWith(10982, INCOMPLETE_PACKAGE.failed);
    expect(retries.update).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({ status: 'escalated', attempts: 5 }),
    );
  });

  it('si el paquete está completo pero el ENVÍO falla, NO marca "completed" — reprograma como si siguiera incompleto', async () => {
    const buildDocumentPackage = jest.fn().mockResolvedValue(COMPLETE_PACKAGE);
    const sendFailure = { key: 'envio_correo', label: 'Envío del correo electrónico', error: 'timeout: sin respuesta de "email.send" tras 30000ms' };
    const sendCompletePackage = jest.fn().mockResolvedValue({ sent: false, queued: false, sendFailure });
    const row = makeRow({ attempts: 0 });
    const { service, automation, retries } = makeService({
      buildDocumentPackage,
      sendCompletePackage,
      findDue: jest.fn().mockResolvedValue([row]),
    });

    await service.processDueRetries();

    expect(retries.update).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({ attempts: 1, lastMissing: [sendFailure] }),
    );
    expect(automation.sendEscalation).not.toHaveBeenCalled();
  });

  it('si el envío sigue fallando hasta el 5to intento, escala usando la falla de envío como motivo', async () => {
    const buildDocumentPackage = jest.fn().mockResolvedValue(COMPLETE_PACKAGE);
    const sendFailure = { key: 'envio_correo', label: 'Envío del correo electrónico', error: 'smtp down' };
    const sendCompletePackage = jest.fn().mockResolvedValue({ sent: false, queued: false, sendFailure });
    const row = makeRow({ attempts: 4 });
    const { service, automation, retries } = makeService({
      buildDocumentPackage,
      sendCompletePackage,
      findDue: jest.fn().mockResolvedValue([row]),
    });

    await service.processDueRetries();

    expect(automation.sendEscalation).toHaveBeenCalledWith(10982, [sendFailure]);
    expect(retries.update).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({ status: 'escalated', attempts: 5, lastMissing: [sendFailure] }),
    );
  });

  it('solo procesa filas "pending" cuyo next_retry_at ya venció (delegado al repo, pero se confirma que se usa el resultado tal cual)', async () => {
    const findDue = jest.fn().mockResolvedValue([]);
    const { service, automation } = makeService({ findDue });

    await service.processDueRetries();

    expect(findDue).toHaveBeenCalled();
    expect(automation.sendCompletePackage).not.toHaveBeenCalled();
  });

  it('un error procesando una fila no detiene el procesamiento de las demás', async () => {
    const rowA = makeRow({ id: 'row-a', numberOrderSales: 111 });
    const rowB = makeRow({ id: 'row-b', numberOrderSales: 222 });
    const buildDocumentPackage = jest.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(COMPLETE_PACKAGE);
    const { service, automation } = makeService({
      buildDocumentPackage,
      findDue: jest.fn().mockResolvedValue([rowA, rowB]),
    });

    await service.processDueRetries();

    expect(automation.sendCompletePackage).toHaveBeenCalledWith(222, COMPLETE_PACKAGE, expect.anything());
  });
  it('no se solapa: si un ciclo sigue corriendo, un segundo tick NO vuelve a tomar las mismas filas ni reenvía el correo (incidente 2026-09-23: 20 órdenes salieron hasta 4 veces)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sendCompletePackage = jest.fn().mockImplementation(async () => {
      await gate;
      return { sent: true, queued: false };
    });
    const findDue = jest.fn().mockResolvedValue([makeRow()]);
    const { service } = makeService({ sendCompletePackage, findDue });

    const first = service.processDueRetries();
    await new Promise((r) => setImmediate(r));
    await service.processDueRetries(); // segundo tick mientras el primero sigue en curso
    release();
    await first;

    expect(findDue).toHaveBeenCalledTimes(1);
    expect(sendCompletePackage).toHaveBeenCalledTimes(1);
  });

  it('si la fila ya no está pending al llegar su turno (un disparador directo ya envió la OV), no la vuelve a enviar', async () => {
    const rowA = makeRow({ id: 'row-a', numberOrderSales: 111 });
    const rowB = makeRow({ id: 'row-b', numberOrderSales: 222 });
    const { service, automation, reports, retries } = makeService({
      findDue: jest.fn().mockResolvedValue([rowA, rowB]),
      currentStatus: { 'row-a': 'completed' },
    });

    await service.processDueRetries();

    expect(reports.buildDocumentPackage).toHaveBeenCalledTimes(1);
    expect(automation.sendCompletePackage).toHaveBeenCalledTimes(1);
    expect(automation.sendCompletePackage).toHaveBeenCalledWith(222, COMPLETE_PACKAGE, expect.anything());
    expect(retries.update).not.toHaveBeenCalledWith('row-a', expect.anything());
  });

  it('una falla al escalar no marca la fila como escalada (se reintenta en el próximo ciclo, no se pierde)', async () => {
    const buildDocumentPackage = jest.fn().mockResolvedValue(INCOMPLETE_PACKAGE);
    const sendEscalation = jest.fn().mockRejectedValue(new Error('db caída'));
    const { service, retries } = makeService({
      buildDocumentPackage,
      sendEscalation,
      findDue: jest.fn().mockResolvedValue([makeRow({ attempts: 4 })]),
    });

    await service.processDueRetries();

    expect(retries.update).not.toHaveBeenCalled();
  });

  it('tras terminar un ciclo (aunque falle) el siguiente sí puede correr', async () => {
    const findDue = jest.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValue([]);
    const { service } = makeService({ findDue });

    await expect(service.processDueRetries()).rejects.toThrow('db');
    await service.processDueRetries();

    expect(findDue).toHaveBeenCalledTimes(2);
  });

  describe('regla PND', () => {
    it('toda fila pasa primero por cartera: si sigue retenida, no se genera ni se envía nada', async () => {
      const carteraGate = jest.fn().mockResolvedValue({ proceed: false, decision: { action: 'retener' } });
      const row = makeRow({ kind: 'cartera', attempts: 1 });
      const { service, reports, automation } = makeService({ carteraGate, findDue: jest.fn().mockResolvedValue([row]) });

      await service.processDueRetries();

      expect(carteraGate).toHaveBeenCalledWith(10982, row);
      expect(reports.buildDocumentPackage).not.toHaveBeenCalled();
      expect(automation.sendCompletePackage).not.toHaveBeenCalled();
    });

    it('una OV incompleta (o recuperada tras un reinicio) también se verifica antes de enviar', async () => {
      const carteraGate = jest.fn().mockResolvedValue({ proceed: false, decision: { action: 'retener' } });
      const { service, automation } = makeService({ carteraGate, findDue: jest.fn().mockResolvedValue([makeRow({ kind: 'incompleto' })]) });
      await service.processDueRetries();
      expect(automation.sendCompletePackage).not.toHaveBeenCalled();
    });

    it('cuando cartera libera, los intentos por documentos incompletos arrancan en cero', async () => {
      const carteraGate = jest.fn().mockResolvedValue({ proceed: true, resetAttempts: true, decision: { action: 'continuar' } });
      const { service, retries } = makeService({
        carteraGate,
        buildDocumentPackage: jest.fn().mockResolvedValue(INCOMPLETE_PACKAGE),
        findDue: jest.fn().mockResolvedValue([makeRow({ kind: 'cartera', attempts: 7 })]),
      });
      await service.processDueRetries();
      expect(retries.update).toHaveBeenCalledWith('row-1', expect.objectContaining({ kind: 'incompleto', attempts: 1 }));
    });

    it('liberada a mano (override): no vuelve a consultar cartera y envía', async () => {
      const carteraGate = jest.fn();
      const { service, automation } = makeService({ carteraGate, findDue: jest.fn().mockResolvedValue([makeRow({ kind: 'incompleto', carteraOverride: true })]) });
      await service.processDueRetries();
      expect(carteraGate).not.toHaveBeenCalled();
      expect(automation.sendCompletePackage).toHaveBeenCalled();
    });
  });
});
