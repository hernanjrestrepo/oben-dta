import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderDocumentStatus } from '../../entities/purchase-order-document.entity';

function makeService(opts: {
  engineEnabled: boolean;
  classification?: { category: string; confidence: number; reasons: string[]; provider: string };
  engineResult?: unknown;
}) {
  const savedPoDocs: unknown[] = [];
  const poRepository = {
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockImplementation((v) => {
      savedPoDocs.push({ ...v });
      return Promise.resolve({ id: 'po1', ...v });
    }),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const clientRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'c1',
      email: 'compras@cliente.com',
      name: 'Cliente Test',
      isActive: true,
      creditLimit: 10000,
      usedCredit: 0,
    }),
  };
  const productRepository = {
    find: jest.fn().mockResolvedValue([{ id: 'p1', sku: 'SKU-1', name: 'Producto Uno', price: 100, isActive: true }]),
  };
  const quoteRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'q1', quoteNumber: 'COT-1', status: 'SENT', validUntil: null }),
  };
  const tenantRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 't1',
      settings: { documentFlowEngine: { purchaseOrders: opts.engineEnabled } },
    }),
  };
  const ctx = { tenantId: 't1', userId: 'u1' };
  const classifiers = {
    resolve: jest.fn().mockResolvedValue({
      classify: jest.fn().mockResolvedValue(
        opts.classification ?? {
          category: 'purchase_order',
          confidence: 0.9,
          reasons: ['orden de compra PO-1'],
          provider: 'rules',
        },
      ),
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const engine = {
    handle: jest.fn().mockResolvedValue(
      opts.engineResult ?? {
        event: 'PURCHASE_ORDER_RECEIVED',
        rules: [
          {
            ruleId: 'r1',
            ruleName: 'PO → Sales Order',
            status: 'completed',
            validations: [{ type: 'client_exists', passed: true }],
            actions: [{ type: 'create_order', status: 'executed', data: { orderId: 'o1', orderNumber: 'OP-1' } }],
          },
        ],
      },
    ),
  };
  const extractor = {
    extract: jest.fn().mockReturnValue({
      poNumber: 'PO-1',
      poDate: null,
      reference: 'COT-1',
      items: [{ raw: 'Producto Uno', quantity: 2, productId: 'p1' }],
      paymentTerms: null,
      incoterm: null,
      observations: null,
      contactPerson: null,
    }),
  };

  const service = new PurchaseOrdersService(
    clientRepository as never,
    productRepository as never,
    quoteRepository as never,
    tenantRepository as never,
    poRepository as never,
    ctx as never,
    engine as never,
    classifiers as never,
    audit as never,
    extractor as never,
  );

  return { service, poRepository, engine, audit, savedPoDocs };
}

const baseDto = { from: 'compras@cliente.com', subject: 'PO', body: 'orden de compra PO-1' };

describe('PurchaseOrdersService.processIncomingEmail', () => {
  it('flag deshabilitado → rechaza explícitamente, no procesa nada', async () => {
    const { service, engine } = makeService({ engineEnabled: false });
    await expect(service.processIncomingEmail(baseDto)).rejects.toThrow(/no está habilitado/);
    expect(engine.handle).not.toHaveBeenCalled();
  });

  it('clasificado como otra categoría → no crea PurchaseOrderDocument ni llama al motor', async () => {
    const { service, poRepository, engine } = makeService({
      engineEnabled: true,
      classification: { category: 'quote_request', confidence: 0.8, reasons: ['cotizar'], provider: 'rules' },
    });
    const result = await service.processIncomingEmail(baseDto);
    expect(result.category).toBe('quote_request');
    expect(result.poDocument).toBeNull();
    expect(poRepository.save).not.toHaveBeenCalled();
    expect(engine.handle).not.toHaveBeenCalled();
  });

  it('PO válida → motor completa, crea PurchaseOrderDocument con status ORDER_CREATED y createdOrderId', async () => {
    const { service, engine, savedPoDocs } = makeService({ engineEnabled: true });
    const result = await service.processIncomingEmail(baseDto);

    expect(result.poDocument?.status).toBe(PurchaseOrderDocumentStatus.ORDER_CREATED);
    expect(result.poDocument?.createdOrderId).toBe('o1');
    // PURCHASE_ORDER_RECEIVED + PURCHASE_ORDER_CREATED (evento de seguimiento)
    expect(engine.handle).toHaveBeenCalledWith('PURCHASE_ORDER_RECEIVED', expect.anything());
    expect(engine.handle).toHaveBeenCalledWith('PURCHASE_ORDER_CREATED', expect.anything());
    expect(savedPoDocs.some((d: any) => d.status === PurchaseOrderDocumentStatus.ORDER_CREATED)).toBe(true);
  });

  it('validación fallida en el motor → status VALIDATION_FAILED, no createdOrderId, emite PURCHASE_ORDER_VALIDATION_FAILED', async () => {
    const { service, engine } = makeService({
      engineEnabled: true,
      engineResult: {
        event: 'PURCHASE_ORDER_RECEIVED',
        rules: [
          {
            ruleId: 'r1',
            ruleName: 'PO → Sales Order',
            status: 'validation_failed',
            validations: [{ type: 'credit_limit', passed: false, message: 'cupo insuficiente' }],
            actions: [],
          },
        ],
      },
    });
    const result = await service.processIncomingEmail(baseDto);
    expect(result.poDocument?.status).toBe(PurchaseOrderDocumentStatus.VALIDATION_FAILED);
    expect(result.poDocument?.createdOrderId).toBeUndefined();
    expect(engine.handle).toHaveBeenCalledWith('PURCHASE_ORDER_VALIDATION_FAILED', expect.anything());
  });

  it('sin DocumentFlowRule activa para el evento → falla explícitamente, no crea nada a medias', async () => {
    const { service } = makeService({
      engineEnabled: true,
      engineResult: { event: 'PURCHASE_ORDER_RECEIVED', rules: [] },
    });
    await expect(service.processIncomingEmail(baseDto)).rejects.toThrow(/no hay DocumentFlowRule activa/);
  });
});
