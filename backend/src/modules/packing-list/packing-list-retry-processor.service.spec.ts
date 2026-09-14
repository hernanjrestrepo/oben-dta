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
  resolveRecipients?: jest.Mock;
  findDue?: jest.Mock;
  update?: jest.Mock;
}) {
  const tenantCtx = { setContext: jest.fn() };
  const reports = { buildDocumentPackage: opts.buildDocumentPackage ?? jest.fn().mockResolvedValue(COMPLETE_PACKAGE) };
  const distributionLists = {
    resolveRecipients: opts.resolveRecipients ?? jest.fn().mockResolvedValue({ to: ['ops@oben.com'], cc: [], bcc: [] }),
  };
  const automation = {
    sendCompletePackage: opts.sendCompletePackage ?? jest.fn().mockResolvedValue({ sent: true, queued: false }),
    sendEscalation: opts.sendEscalation ?? jest.fn().mockResolvedValue(undefined),
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
});
