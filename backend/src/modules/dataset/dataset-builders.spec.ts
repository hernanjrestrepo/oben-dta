import { SeededRandom } from './prng';
import {
  buildClients,
  buildProducts,
  buildIncoterms,
  buildOrders,
  isInvoiceable,
  buildInvoice,
  buildCreditValidation,
  buildQuotes,
  isProductionEligible,
  buildProductionOrder,
  buildExportOperation,
  buildShipment,
  buildShipmentTracking,
  buildPackingList,
  ClientRef,
  ProductRef,
} from './dataset-builders';
import { OrderStatus } from '../../entities/order.entity';
import { DianStatus } from '../../entities/invoice.entity';
import { ExportOperationStatus } from '../../entities/export-operation.entity';
import { ShipmentStatus } from '../../entities/shipment.entity';

describe('dataset-builders — determinismo', () => {
  it('buildClients con el mismo seed produce exactamente los mismos datos', () => {
    const a = buildClients(new SeededRandom(42), 20);
    const b = buildClients(new SeededRandom(42), 20);
    expect(a).toEqual(b);
  });

  it('buildProducts con el mismo seed produce exactamente los mismos datos', () => {
    const a = buildProducts(new SeededRandom(7), 30);
    const b = buildProducts(new SeededRandom(7), 30);
    expect(a).toEqual(b);
  });

  it('seeds distintos producen datos distintos', () => {
    const a = buildClients(new SeededRandom(1), 5);
    const b = buildClients(new SeededRandom(2), 5);
    expect(a).not.toEqual(b);
  });
});

describe('buildClients', () => {
  it('genera el conteo solicitado con clientId únicos y usedCredit <= creditLimit', () => {
    const clients = buildClients(new SeededRandom(1), 50);
    expect(clients).toHaveLength(50);
    const ids = new Set(clients.map((c) => c.clientId));
    expect(ids.size).toBe(50);
    for (const c of clients) {
      expect(c.usedCredit).toBeLessThanOrEqual(c.creditLimit);
      expect(c.usedCredit).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('buildProducts', () => {
  it('genera SKUs únicos y precios positivos', () => {
    const products = buildProducts(new SeededRandom(5), 100);
    expect(products).toHaveLength(100);
    const skus = new Set(products.map((p) => p.sku));
    expect(skus.size).toBe(100);
    for (const p of products) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.stock).toBeGreaterThanOrEqual(0);
      expect(p.committed).toBeLessThanOrEqual(p.stock);
    }
  });
});

describe('buildIncoterms', () => {
  it('devuelve exactamente 4 incoterms estándar con códigos únicos', () => {
    const incoterms = buildIncoterms();
    expect(incoterms).toHaveLength(4);
    const codes = new Set(incoterms.map((i) => i.code));
    expect(codes).toEqual(new Set(['EXW', 'FOB', 'CIF', 'DDP']));
  });
});

describe('buildOrders', () => {
  const clients: ClientRef[] = Array.from({ length: 10 }, (_, i) => ({
    id: `client-${i}`,
    creditLimit: 1_000_000,
    usedCredit: 100_000,
  }));
  const products: ProductRef[] = Array.from({ length: 20 }, (_, i) => ({
    id: `product-${i}`,
    price: 10_000 + i * 1000,
  }));

  it('cada orden tiene totalAmount = suma de sus items', () => {
    const orders = buildOrders(new SeededRandom(9), clients, products, 30);
    expect(orders).toHaveLength(30);
    for (const plan of orders) {
      const expectedTotal = plan.items.reduce((s, i) => s + i.totalPrice, 0);
      expect(plan.order.totalAmount).toBeCloseTo(Math.round(expectedTotal * 100) / 100, 2);
      expect(plan.items.length).toBeGreaterThanOrEqual(1);
      expect(plan.items.length).toBeLessThanOrEqual(5);
    }
  });

  it('orderNumber son únicos', () => {
    const orders = buildOrders(new SeededRandom(9), clients, products, 100);
    const numbers = new Set(orders.map((o) => o.order.orderNumber));
    expect(numbers.size).toBe(100);
  });

  it('todos los productId referenciados existen en el pool de productos', () => {
    const orders = buildOrders(new SeededRandom(3), clients, products, 50);
    const validIds = new Set(products.map((p) => p.id));
    for (const plan of orders) {
      for (const item of plan.items) {
        expect(validIds.has(item.productId)).toBe(true);
      }
    }
  });
});

describe('invoices — reglas de facturación', () => {
  it('isInvoiceable excluye DRAFT/PENDING_VALIDATION/BLOCKED/CANCELLED', () => {
    expect(isInvoiceable(OrderStatus.DRAFT)).toBe(false);
    expect(isInvoiceable(OrderStatus.PENDING_VALIDATION)).toBe(false);
    expect(isInvoiceable(OrderStatus.BLOCKED)).toBe(false);
    expect(isInvoiceable(OrderStatus.CANCELLED)).toBe(false);
    expect(isInvoiceable(OrderStatus.CONFIRMED)).toBe(true);
    expect(isInvoiceable(OrderStatus.DELIVERED)).toBe(true);
  });

  it('buildInvoice calcula IVA 19% correctamente y dianStatus SIEMPRE PENDING', () => {
    const order = { id: 'o1', totalAmount: 1_000_000, status: OrderStatus.DELIVERED, createdAt: new Date('2026-01-01') };
    const inv = buildInvoice(new SeededRandom(1), 0, order);
    expect(inv.amount).toBe(1_000_000);
    expect(inv.taxAmount).toBe(190_000);
    expect(inv.totalAmount).toBe(1_190_000);
    // Invariante de honestidad: el dataset sintético nunca simula un envío real a DIAN.
    expect(inv.dianStatus).toBe(DianStatus.PENDING);
  });
});

describe('buildCreditValidation', () => {
  it('APPROVED cuando el monto de la orden cabe en el disponible', () => {
    const client: ClientRef = { id: 'c1', creditLimit: 1_000_000, usedCredit: 200_000 };
    const order = { id: 'o1', totalAmount: 500_000, createdAt: new Date() };
    const cv = buildCreditValidation(0, order, client);
    expect(cv.isCreditSufficient).toBe(true);
    expect(cv.availableCredit).toBe(800_000);
  });

  it('REJECTED cuando el monto excede el disponible', () => {
    const client: ClientRef = { id: 'c1', creditLimit: 1_000_000, usedCredit: 900_000 };
    const order = { id: 'o1', totalAmount: 500_000, createdAt: new Date() };
    const cv = buildCreditValidation(0, order, client);
    expect(cv.isCreditSufficient).toBe(false);
    expect(cv.availableCredit).toBe(100_000);
  });
});

describe('buildQuotes', () => {
  it('total = subtotal + taxAmount', () => {
    const clients: ClientRef[] = [{ id: 'c1', creditLimit: 1, usedCredit: 0 }];
    const products: ProductRef[] = [{ id: 'p1', price: 10000 }, { id: 'p2', price: 20000 }];
    const quotes = buildQuotes(new SeededRandom(2), clients, products, 10);
    for (const q of quotes) {
      expect(q.quote.total).toBeCloseTo(q.quote.subtotal + q.quote.taxAmount, 2);
    }
  });
});

describe('production orders', () => {
  it('isProductionEligible solo para estados post-confirmación', () => {
    expect(isProductionEligible(OrderStatus.DRAFT)).toBe(false);
    expect(isProductionEligible(OrderStatus.CONFIRMED)).toBe(false);
    expect(isProductionEligible(OrderStatus.IN_PRODUCTION)).toBe(true);
    expect(isProductionEligible(OrderStatus.DELIVERED)).toBe(true);
  });

  it('remainingQuantity nunca es negativo', () => {
    const order = { id: 'o1', status: OrderStatus.IN_PRODUCTION, createdAt: new Date() };
    const item = { productId: 'p1', quantity: 10, unitPrice: 100, totalPrice: 1000 };
    const po = buildProductionOrder(new SeededRandom(4), 0, order, item);
    expect(po.remainingQuantity).toBeGreaterThanOrEqual(0);
    expect(po.completedQuantity).toBeLessThanOrEqual(po.quantity);
  });

  it('orden DELIVERED siempre queda con producción completa', () => {
    const order = { id: 'o1', status: OrderStatus.DELIVERED, createdAt: new Date() };
    const item = { productId: 'p1', quantity: 25, unitPrice: 100, totalPrice: 2500 };
    const po = buildProductionOrder(new SeededRandom(4), 0, order, item);
    expect(po.completedQuantity).toBe(25);
    expect(po.remainingQuantity).toBe(0);
  });
});

describe('export operations', () => {
  it('usa únicamente incotermId del pool provisto', () => {
    const order = { id: 'o1', clientId: 'c1', totalAmount: 1_000_000, createdAt: new Date() };
    const incotermIds = ['inc-1', 'inc-2'];
    const exp = buildExportOperation(new SeededRandom(6), 0, order, incotermIds);
    expect(incotermIds).toContain(exp.incotermId);
  });

  it('profitMargin es coherente con totalRevenue y totalCosts', () => {
    const order = { id: 'o1', clientId: 'c1', totalAmount: 2_000_000, createdAt: new Date() };
    const exp = buildExportOperation(new SeededRandom(6), 0, order, ['inc-1']);
    const expected = Math.round(((exp.totalRevenue - exp.totalCosts) / exp.totalRevenue) * 10000) / 100;
    expect(exp.profitMargin).toBeCloseTo(expected, 2);
  });
});

describe('shipments + tracking + packing list', () => {
  function makeExportOp(status: ExportOperationStatus) {
    return {
      exportNumber: 'EXP-SEED-000001',
      orderId: 'o1',
      clientId: 'c1',
      status,
      type: 'STANDARD' as never,
      destinationCountry: 'US',
      destinationPort: 'Miami',
      destinationAddress: 'x',
      incotermId: 'inc-1',
      orderValue: 1000,
      liquidatedValue: 1050,
      totalCosts: 150,
      totalRevenue: 1050,
      profitMargin: 85,
      totalGrossWeight: 100,
      totalNetWeight: 90,
      totalVolume: 5,
      totalPackages: 10,
      containerType: '40HC',
      containerNumber: 'X1',
      expectedDepartureDate: new Date('2026-01-01'),
      actualDepartureDate: new Date('2026-01-01'),
      expectedArrivalDate: new Date('2026-01-15'),
      actualArrivalDate: new Date('2026-01-15'),
      customsCleared: true,
      requiresExportLicense: false,
      createdAt: new Date('2025-12-20'),
      id: 'exp-1',
    };
  }

  it('shipment DELIVERED solo si export operation está DELIVERED', () => {
    const deliveredExp = makeExportOp(ExportOperationStatus.DELIVERED);
    const shp = buildShipment(new SeededRandom(1), 0, deliveredExp);
    expect(shp.status).toBe(ShipmentStatus.DELIVERED);
    expect(shp.deliverySuccessful).toBe(true);
    expect(shp.actualDeliveryDate).not.toBeNull();
  });

  it('shipment no-delivered no tiene actualDeliveryDate', () => {
    const inTransitExp = makeExportOp(ExportOperationStatus.SHIPPED);
    const shp = buildShipment(new SeededRandom(1), 0, inTransitExp);
    expect(shp.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(shp.actualDeliveryDate).toBeNull();
  });

  it('tracking de shipment DELIVERED cubre las 5 etapas', () => {
    const events = buildShipmentTracking(new SeededRandom(1), {
      id: 's1', status: ShipmentStatus.DELIVERED, createdAt: new Date('2026-01-01'),
    });
    expect(events).toHaveLength(5);
    expect(events[events.length - 1].status).toBe('DELIVERED');
  });

  it('tracking de shipment en tránsito tiene solo 2-3 etapas', () => {
    const events = buildShipmentTracking(new SeededRandom(1), {
      id: 's1', status: ShipmentStatus.IN_TRANSIT, createdAt: new Date('2026-01-01'),
    });
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.length).toBeLessThanOrEqual(3);
  });

  it('packing list refleja los totales de la export operation', () => {
    const exp = makeExportOp(ExportOperationStatus.DELIVERED);
    const pl = buildPackingList(new SeededRandom(1), 0, exp, 42);
    expect(pl.totalItems).toBe(42);
    expect(pl.totalPackages).toBe(exp.totalPackages);
    expect(pl.totalGrossWeight).toBe(exp.totalGrossWeight);
  });
});
