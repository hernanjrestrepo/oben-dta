import {
  ClientExistsValidator,
  DomainAuthorizedValidator,
  QuoteExistsValidator,
  QuoteValidValidator,
  CreditLimitValidator,
  ProductsValidValidator,
  QuantitiesCoherentValidator,
} from './purchase-order-validators';
import { DocumentFlowContext } from '../document-flow/document-flow-context.types';

function ctx(overrides: Partial<DocumentFlowContext> = {}): DocumentFlowContext {
  return { tenantId: 't1', metadata: {}, ...overrides };
}

describe('ClientExistsValidator', () => {
  const v = new ClientExistsValidator();
  it('pasa si context.client existe', async () => {
    expect((await v.validate({ validation: { type: 'client_exists' }, context: ctx({ client: { id: 'c1' } }) })).passed).toBe(true);
  });
  it('falla si no hay client', async () => {
    expect((await v.validate({ validation: { type: 'client_exists' }, context: ctx({ client: null }) })).passed).toBe(false);
  });
});

describe('DomainAuthorizedValidator', () => {
  const v = new DomainAuthorizedValidator();
  it('pasa si el cliente está activo', async () => {
    expect((await v.validate({ validation: { type: 'domain_authorized' }, context: ctx({ client: { id: 'c1', isActive: true } }) })).passed).toBe(true);
  });
  it('falla si el cliente existe pero inactivo', async () => {
    expect((await v.validate({ validation: { type: 'domain_authorized' }, context: ctx({ client: { id: 'c1', isActive: false } }) })).passed).toBe(false);
  });
});

describe('QuoteExistsValidator / QuoteValidValidator', () => {
  const exists = new QuoteExistsValidator();
  const valid = new QuoteValidValidator();

  it('QuoteExists falla sin cotización', async () => {
    expect((await exists.validate({ validation: { type: 'quote_exists' }, context: ctx({ quote: null }) })).passed).toBe(false);
  });
  it('QuoteValid pasa con status vigente y sin vencimiento', async () => {
    const r = await valid.validate({ validation: { type: 'quote_valid' }, context: ctx({ quote: { id: 'q1', status: 'SENT', validUntil: null } }) });
    expect(r.passed).toBe(true);
  });
  it('QuoteValid falla si status=REJECTED', async () => {
    const r = await valid.validate({ validation: { type: 'quote_valid' }, context: ctx({ quote: { id: 'q1', status: 'REJECTED' } }) });
    expect(r.passed).toBe(false);
  });
  it('QuoteValid falla si validUntil ya pasó', async () => {
    const r = await valid.validate({
      validation: { type: 'quote_valid' },
      context: ctx({ quote: { id: 'q1', status: 'SENT', validUntil: '2020-01-01T00:00:00.000Z' } }),
    });
    expect(r.passed).toBe(false);
  });
});

describe('CreditLimitValidator', () => {
  const v = new CreditLimitValidator();
  it('pasa si el cupo disponible cubre el total estimado', async () => {
    const r = await v.validate({
      validation: { type: 'credit_limit' },
      context: ctx({ client: { id: 'c1', creditLimit: 10000, usedCredit: 2000 }, metadata: { purchaseOrder: { items: [], estimatedTotal: 5000 } } }),
    });
    expect(r.passed).toBe(true);
  });
  it('falla si el total estimado excede el cupo disponible', async () => {
    const r = await v.validate({
      validation: { type: 'credit_limit' },
      context: ctx({ client: { id: 'c1', creditLimit: 10000, usedCredit: 9000 }, metadata: { purchaseOrder: { items: [], estimatedTotal: 5000 } } }),
    });
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/Cupo insuficiente/);
  });
});

describe('ProductsValidValidator', () => {
  const v = new ProductsValidValidator();
  it('falla si algún item no tiene productId (no matcheó catálogo)', async () => {
    const r = await v.validate({
      validation: { type: 'products_valid' },
      context: ctx({ metadata: { purchaseOrder: { items: [{ raw: 'X', quantity: 1, productId: null }], estimatedTotal: 0 } } }),
    });
    expect(r.passed).toBe(false);
  });
  it('pasa si todos los items matchearon', async () => {
    const r = await v.validate({
      validation: { type: 'products_valid' },
      context: ctx({ metadata: { purchaseOrder: { items: [{ raw: 'X', quantity: 1, productId: 'p1' }], estimatedTotal: 100 } } }),
    });
    expect(r.passed).toBe(true);
  });
});

describe('QuantitiesCoherentValidator', () => {
  const v = new QuantitiesCoherentValidator();
  it('falla con cantidad cero o negativa', async () => {
    const r = await v.validate({
      validation: { type: 'quantities_coherent' },
      context: ctx({ metadata: { purchaseOrder: { items: [{ raw: 'X', quantity: 0, productId: 'p1' }], estimatedTotal: 0 } } }),
    });
    expect(r.passed).toBe(false);
  });
  it('pasa con cantidades enteras positivas razonables', async () => {
    const r = await v.validate({
      validation: { type: 'quantities_coherent' },
      context: ctx({ metadata: { purchaseOrder: { items: [{ raw: 'X', quantity: 5, productId: 'p1' }], estimatedTotal: 500 } } }),
    });
    expect(r.passed).toBe(true);
  });
});
