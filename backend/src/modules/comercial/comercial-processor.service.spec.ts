import { TenantContext } from '../../common/tenant/tenant-context.service';
import { ComercialFlujoService } from './comercial-flujo.service';
import { ComercialProcessorService } from './comercial-processor.service';

function make(casos: Array<{ id: string; tenantId: string }>, opts: { procesar?: jest.Mock; actual?: (id: string) => unknown } = {}) {
  const ctx = { setContext: jest.fn() };
  const flujo = {
    obtener: jest.fn(async (id: string) => (opts.actual ? opts.actual(id) : { id, nextCheckAt: new Date(Date.now() - 1000) })),
    procesar: opts.procesar ?? jest.fn().mockResolvedValue(undefined),
  };
  const moduleRef = {
    resolve: jest.fn(async (type: unknown) => (type === TenantContext ? ctx : type === ComercialFlujoService ? flujo : null)),
  };
  const repo = { find: jest.fn().mockResolvedValue(casos), update: jest.fn().mockResolvedValue(undefined) };
  return { service: new ComercialProcessorService(repo as never, moduleRef as never), repo, flujo, ctx };
}

describe('ComercialProcessorService (motor de fondo del flujo Comercial)', () => {
  it('procesa cada caso vencido en el contexto de SU tenant', async () => {
    const { service, flujo, ctx } = make([{ id: 'a', tenantId: 't1' }, { id: 'b', tenantId: 't2' }]);
    await expect(service.procesarVencidos()).resolves.toBe(2);
    expect(ctx.setContext).toHaveBeenNthCalledWith(1, 't1', null, false);
    expect(ctx.setContext).toHaveBeenNthCalledWith(2, 't2', null, false);
    expect(flujo.procesar).toHaveBeenCalledTimes(2);
  });

  it('relee el caso: si alguien ya lo atendió (ya no está vencido), no lo procesa', async () => {
    const { service, flujo } = make([{ id: 'a', tenantId: 't1' }], { actual: (id) => ({ id, nextCheckAt: new Date(Date.now() + 60_000) }) });
    await service.procesarVencidos();
    expect(flujo.procesar).not.toHaveBeenCalled();
  });

  it('un error en un caso no detiene los demás y lo reprograma a 15 minutos (no cada minuto para siempre)', async () => {
    const procesar = jest.fn().mockRejectedValueOnce(new Error('OBEN MAS caído')).mockResolvedValue(undefined);
    const { service, repo } = make([{ id: 'a', tenantId: 't1' }, { id: 'b', tenantId: 't1' }], { procesar });
    await expect(service.procesarVencidos()).resolves.toBe(1);
    const [id, { nextCheckAt }] = repo.update.mock.calls[0];
    expect(id).toBe('a');
    expect(nextCheckAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
  });

  it('no se solapa: un segundo ciclo mientras corre el primero no hace nada', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const procesar = jest.fn(async () => gate);
    const { service, repo } = make([{ id: 'a', tenantId: 't1' }], { procesar });
    const first = service.procesarVencidos();
    await new Promise((r) => setImmediate(r));
    await expect(service.procesarVencidos()).resolves.toBe(0);
    release();
    await first;
    expect(repo.find).toHaveBeenCalledTimes(1);
  });

  it('filtra por tenant cuando se pide "procesar ahora"', async () => {
    const { service, repo } = make([]);
    await service.procesarVencidos('t9');
    expect(repo.find.mock.calls[0][0].where).toMatchObject({ tenantId: 't9' });
  });
});
