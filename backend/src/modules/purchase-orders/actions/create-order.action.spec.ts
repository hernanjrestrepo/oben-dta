import { CreateOrderAction } from './create-order.action';

function makeAction() {
  const savedOrders: unknown[] = [];
  const orders = {
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockImplementation((v) => {
      const withId = { id: v.id ?? 'o1', ...v };
      savedOrders.push(withId);
      return Promise.resolve(withId);
    }),
  };
  const savedItems: unknown[] = [];
  const orderItems = {
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockImplementation((v) => {
      savedItems.push(v);
      return Promise.resolve(v);
    }),
  };
  const products = {
    findOne: jest.fn().mockResolvedValue({ id: 'p1', price: 100 }),
  };
  const action = new CreateOrderAction(orders as never, orderItems as never, products as never);
  return { action, orders, orderItems, products, savedOrders, savedItems };
}

describe('CreateOrderAction', () => {
  it('crea la orden y sus items directamente por repositorio, con el tenantId del contexto', async () => {
    const { action, orders, orderItems, savedItems } = makeAction();
    const result = await action.execute({
      action: { type: 'create_order' },
      context: {
        tenantId: 't1',
        client: { id: 'c1' },
        metadata: {
          purchaseOrder: {
            poDocumentId: 'po1',
            poNumber: 'PO-108149',
            items: [{ productId: 'p1', quantity: 3 }],
            reference: 'COT-5521',
          },
        },
      },
      documents: [],
      recipients: [],
    });

    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'c1', tenantId: 't1' }),
    );
    expect(orderItems.save).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p1', quantity: 3, tenantId: 't1', totalPrice: 300 }),
    );
    expect(savedItems).toHaveLength(1);
    expect(result.status).toBe('executed');
    expect(result.data).toMatchObject({ totalAmount: 300 });
  });

  it('sin cliente resuelto → falla explícitamente, no intenta crear la orden', async () => {
    const { action, orders } = makeAction();
    const result = await action.execute({
      action: { type: 'create_order' },
      context: { tenantId: 't1', client: null, metadata: { purchaseOrder: { poDocumentId: 'po1', items: [{ productId: 'p1', quantity: 1 }] } } },
      documents: [],
      recipients: [],
    });
    expect(result.status).toBe('failed');
    expect(orders.create).not.toHaveBeenCalled();
  });
});
