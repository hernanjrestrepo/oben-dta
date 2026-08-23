import { PurchaseOrderExtractor } from './purchase-order-extractor';
import { Product } from '../../entities/product.entity';

function product(overrides: Partial<Product>): Product {
  return { id: 'p1', sku: 'SKU-1', name: 'Producto', price: 100, ...overrides } as Product;
}

describe('PurchaseOrderExtractor', () => {
  const extractor = new PurchaseOrderExtractor();

  it('extrae PO number, fecha, referencia, pago, incoterm, observaciones y contacto', () => {
    const body = [
      'Adjuntamos orden de compra PO-108149.',
      'Fecha: 2026-07-15',
      'Referencia: COT-5521',
      'Condiciones de pago: 30 días fecha factura',
      'Incoterm: FOB',
      'Observaciones: entregar en horario de bodega',
      'Atención: Camilo Guerrero',
      '3 x Rodamiento tipo D566',
    ].join('\n');
    const catalog = [product({ id: 'p1', sku: 'SKU-1', name: 'Rodamiento tipo D566', price: 100 })];

    const result = extractor.extract(body, catalog);

    expect(result.poNumber).toBe('108149');
    expect(result.poDate?.toISOString().slice(0, 10)).toBe('2026-07-15');
    expect(result.reference).toBe('COT-5521');
    expect(result.paymentTerms).toMatch(/30 días/);
    expect(result.incoterm).toBe('FOB');
    expect(result.observations).toMatch(/horario de bodega/);
    expect(result.contactPerson).toBe('Camilo Guerrero');
    expect(result.items).toEqual([{ raw: 'Rodamiento tipo D566', quantity: 3, productId: 'p1' }]);
  });

  it('producto no reconocido → item no aparece en la lista (queda para el validador products_valid)', () => {
    const body = '10 Widgets Inexistentes';
    const result = extractor.extract(body, [product({ id: 'p1', name: 'Otro producto' })]);
    expect(result.items).toHaveLength(0);
  });

  it('sin ningún campo reconocible → todos null/vacío, no revienta', () => {
    const result = extractor.extract('Hola, ¿cómo están?', []);
    expect(result.poNumber).toBeNull();
    expect(result.items).toEqual([]);
    expect(result.incoterm).toBeNull();
  });
});
