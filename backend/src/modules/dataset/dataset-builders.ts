import { SeededRandom } from './prng';
import { OrderStatus } from '../../entities/order.entity';
import { InvoiceStatus, DianStatus } from '../../entities/invoice.entity';
import {
  CreditValidationStatus,
  CreditValidationType,
} from '../../entities/credit-validation.entity';
import { QuoteStatus } from '../../entities/quote.entity';
import {
  ProductionOrderStatus,
  ProductionPriority,
} from '../../entities/production-order.entity';
import {
  ExportOperationStatus,
  ExportType,
} from '../../entities/export-operation.entity';
import {
  ShipmentStatus,
  ShipmentType,
  CarrierType,
} from '../../entities/shipment.entity';
import {
  PackingListStatus,
  PackingListType,
} from '../../entities/packing-list.entity';
import { IncotermGroup } from '../../entities/incoterm.entity';

/**
 * Builders puros del dataset semilla — sin efectos de lado, sin BD.
 * Dado el mismo SeededRandom (mismo seed) y los mismos insumos, siempre
 * devuelven exactamente las mismas filas. Cada función recibe únicamente
 * los datos que necesita para correlacionar (nunca conoce tenantId — el
 * orquestador (`dataset-generator.service.ts`) estampa tenantId al persistir).
 *
 * Todos los campos usados aquí fueron verificados contra las entidades reales
 * (no se repiten los campos inexistentes que rompían el SeedService legacy).
 */

// ---------------------------------------------------------------------------
// Vocabulario para nombres realistas (determinista vía rng, no listas azarosas
// de verdad — controlado para que el mismo seed produzca el mismo nombre).
// ---------------------------------------------------------------------------

const COMPANY_PREFIXES = [
  'Industrias',
  'Comercializadora',
  'Distribuidora',
  'Exportadora',
  'Manufacturas',
  'Grupo',
  'Corporación',
  'Suministros',
  'Importadora',
  'Fábrica',
];
const COMPANY_CORES = [
  'del Norte',
  'Andina',
  'del Pacífico',
  'Nacional',
  'Continental',
  'del Caribe',
  'Central',
  'Industrial',
  'Colombiana',
  'del Sur',
  'Metropolitana',
  'Global',
];
const COMPANY_SUFFIXES = [
  'S.A.S.',
  'Ltda.',
  'S.A.',
  'e Hijos S.A.S.',
  '& Cía.',
];

const CITIES = [
  'Bogotá',
  'Medellín',
  'Cali',
  'Barranquilla',
  'Cartagena',
  'Bucaramanga',
  'Pereira',
  'Manizales',
  'Ibagué',
  'Santa Marta',
];

const PRODUCT_FAMILIES = [
  { name: 'Sellos hidráulicos', priceRange: [15000, 85000] },
  { name: 'Empaques industriales', priceRange: [8000, 45000] },
  { name: 'Tornillería', priceRange: [500, 12000] },
  { name: 'Perfiles metálicos', priceRange: [45000, 250000] },
  { name: 'Anclajes', priceRange: [6000, 35000] },
  { name: 'Rodamientos', priceRange: [20000, 180000] },
  { name: 'Válvulas', priceRange: [35000, 320000] },
  { name: 'Mangueras industriales', priceRange: [12000, 95000] },
];

const CARRIERS = [
  'Maersk Line',
  'DHL',
  'FedEx',
  'Transportes Andinos',
  'Servientrega',
];
const DESTINATION_COUNTRIES = [
  'United States',
  'Mexico',
  'Peru',
  'Ecuador',
  'Chile',
  'Spain',
];

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export interface ClientSeed {
  clientId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  creditLimit: number;
  usedCredit: number;
  isActive: boolean;
  createdAt: Date;
}

export function buildClients(
  rng: SeededRandom,
  count: number,
  runTag = '',
): ClientSeed[] {
  const tag = runTag ? `${runTag}-` : '';
  const out: ClientSeed[] = [];
  for (let i = 0; i < count; i++) {
    const prefix = rng.pick(COMPANY_PREFIXES);
    const core = rng.pick(COMPANY_CORES);
    const suffix = rng.pick(COMPANY_SUFFIXES);
    const name = `${prefix} ${core} ${suffix}`;
    const idNum = String(i + 1).padStart(5, '0');
    const creditLimit = rng.int(5, 50) * 100_000;
    const usedCredit = Math.round(creditLimit * rng.float(0, 0.7));
    out.push({
      clientId: `CLI-${tag}${idNum}`,
      name: `${name} #${idNum}`,
      email: `contacto${idNum}@${name
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .slice(0, 12)}.com`,
      phone: `+57 ${rng.int(300, 320)} ${rng.int(100, 999)} ${rng.int(1000, 9999)}`,
      address: `Calle ${rng.int(1, 150)} # ${rng.int(1, 99)}-${rng.int(1, 99)}, ${rng.pick(CITIES)}, Colombia`,
      creditLimit,
      usedCredit,
      isActive: rng.bool(0.95),
      createdAt: rng.pastDate(365, 30),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface ProductSeed {
  sku: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  committed: number;
  isActive: boolean;
  createdAt: Date;
}

export function buildProducts(
  rng: SeededRandom,
  count: number,
  runTag = '',
): ProductSeed[] {
  const tag = runTag ? `${runTag}-` : '';
  const out: ProductSeed[] = [];
  for (let i = 0; i < count; i++) {
    const family = rng.pick(PRODUCT_FAMILIES);
    const idNum = String(i + 1).padStart(6, '0');
    const price = rng.int(family.priceRange[0], family.priceRange[1]);
    const stock = rng.bool(0.1) ? rng.int(0, 9) : rng.int(10, 5000);
    out.push({
      sku: `SKU-${tag}${idNum}`,
      name: `${family.name} tipo ${rng.pick(['A', 'B', 'C', 'D', 'E'])}${rng.int(100, 999)}`,
      description: `${family.name} de uso industrial, referencia ${idNum}`,
      price,
      stock,
      committed: Math.round(stock * rng.float(0, 0.3)),
      isActive: rng.bool(0.97),
      createdAt: rng.pastDate(365, 30),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Incoterms (catálogo global, no tenant-scoped — solo 4 filas fijas)
// ---------------------------------------------------------------------------

export interface IncotermSeed {
  code: string;
  name: string;
  group: IncotermGroup;
  description: string;
  sellerResponsibilities: string;
  buyerResponsibilities: string;
  isActive: boolean;
  sortOrder: number;
}

export function buildIncoterms(): IncotermSeed[] {
  return [
    {
      code: 'EXW',
      name: 'Ex Works',
      group: IncotermGroup.E,
      description:
        'El vendedor pone la mercancía a disposición en sus instalaciones',
      sellerResponsibilities: 'Poner la mercancía disponible en fábrica',
      buyerResponsibilities: 'Todos los costos y riesgos desde origen',
      isActive: true,
      sortOrder: 1,
    },
    {
      code: 'FOB',
      name: 'Free On Board',
      group: IncotermGroup.F,
      description: 'El vendedor entrega la mercancía a bordo del buque',
      sellerResponsibilities:
        'Entregar a bordo del buque en puerto de embarque',
      buyerResponsibilities: 'Costos y riesgos desde el buque',
      isActive: true,
      sortOrder: 2,
    },
    {
      code: 'CIF',
      name: 'Cost, Insurance and Freight',
      group: IncotermGroup.C,
      description: 'El vendedor paga flete y seguro hasta destino',
      sellerResponsibilities: 'Pagar flete y seguro hasta puerto destino',
      buyerResponsibilities: 'Costos y riesgos desde el buque',
      isActive: true,
      sortOrder: 3,
    },
    {
      code: 'DDP',
      name: 'Delivered Duty Paid',
      group: IncotermGroup.D,
      description: 'El vendedor asume todos los costos y riesgos hasta destino',
      sellerResponsibilities:
        'Entregar en destino, despachado para importación',
      buyerResponsibilities: 'Recibir la mercancía en destino',
      isActive: true,
      sortOrder: 4,
    },
  ];
}

// ---------------------------------------------------------------------------
// Orders + Order Items
// ---------------------------------------------------------------------------

export interface ClientRef {
  id: string;
  creditLimit: number;
  usedCredit: number;
}
export interface ProductRef {
  id: string;
  price: number;
}

export interface OrderItemSeedInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderSeedInput {
  orderNumber: string;
  clientId: string;
  totalAmount: number;
  status: OrderStatus;
  createdAt: Date;
}

export interface OrderPlan {
  order: OrderSeedInput;
  items: OrderItemSeedInput[];
  /** Snapshot del cliente al momento de crear la orden (para credit validation). */
  clientSnapshot: ClientRef;
}

const ORDER_STATUS_WEIGHTS: ReadonlyArray<readonly [OrderStatus, number]> = [
  [OrderStatus.DRAFT, 5],
  [OrderStatus.PENDING_VALIDATION, 10],
  [OrderStatus.CONFIRMED, 25],
  [OrderStatus.PENDING_PRODUCTION, 10],
  [OrderStatus.IN_PRODUCTION, 10],
  [OrderStatus.READY_FOR_DELIVERY, 10],
  [OrderStatus.DELIVERED, 25],
  [OrderStatus.BLOCKED, 3],
  [OrderStatus.CANCELLED, 2],
];

/**
 * Genera el plan de órdenes. Usa distribución pareto simple sobre clientes
 * (los primeros 20% concentran más pedidos) para que el dataset se parezca a
 * un negocio real en vez de una distribución uniforme artificial.
 */
export function buildOrders(
  rng: SeededRandom,
  clients: ClientRef[],
  products: ProductRef[],
  count: number,
  runTag = '',
): OrderPlan[] {
  const tag = runTag ? `${runTag}-` : '';
  const paretoBoundary = Math.max(1, Math.floor(clients.length * 0.2));
  const out: OrderPlan[] = [];
  for (let i = 0; i < count; i++) {
    const useTopClients = rng.bool(0.6);
    const client = useTopClients
      ? clients[rng.int(0, paretoBoundary - 1)]
      : rng.pick(clients);

    const itemCount = rng.int(1, 5);
    const items: OrderItemSeedInput[] = [];
    let totalAmount = 0;
    const usedProductIdx = new Set<number>();
    for (let j = 0; j < itemCount; j++) {
      let idx = rng.int(0, products.length - 1);
      let guard = 0;
      while (usedProductIdx.has(idx) && guard < 5) {
        idx = rng.int(0, products.length - 1);
        guard++;
      }
      usedProductIdx.add(idx);
      const product = products[idx];
      const quantity = rng.int(1, 50);
      const totalPrice = Math.round(product.price * quantity * 100) / 100;
      items.push({
        productId: product.id,
        quantity,
        unitPrice: product.price,
        totalPrice,
      });
      totalAmount += totalPrice;
    }

    const status = rng.pickWeighted(ORDER_STATUS_WEIGHTS);
    const idNum = String(i + 1).padStart(6, '0');

    out.push({
      order: {
        orderNumber: `ORD-SEED-${tag}${idNum}`,
        clientId: client.id,
        totalAmount: Math.round(totalAmount * 100) / 100,
        status,
        createdAt: rng.pastDate(180, 0),
      },
      items,
      clientSnapshot: client,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Invoices — solo para órdenes facturables (no DRAFT/PENDING_VALIDATION/BLOCKED/CANCELLED)
// ---------------------------------------------------------------------------

const IVA_RATE = 0.19;
const INVOICEABLE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.CONFIRMED,
  OrderStatus.PENDING_PRODUCTION,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.DELIVERED,
]);

export interface InvoiceSeedInput {
  invoiceNumber: string;
  orderId: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  dianStatus: DianStatus;
  dueDate: Date;
  createdAt: Date;
}

export function isInvoiceable(status: OrderStatus): boolean {
  return INVOICEABLE_STATUSES.has(status);
}

/**
 * Genera UNA factura para una orden facturable. dianStatus queda SIEMPRE en
 * PENDING: son facturas sintéticas de dataset, nunca pasaron por un envío real
 * a la DIAN (mock o real), y afirmar 'ACEPTADA' sería fabricar una verificación
 * que no ocurrió — mismo principio de honestidad que rige el resto de DTA.
 */
export function buildInvoice(
  rng: SeededRandom,
  index: number,
  order: {
    id: string;
    totalAmount: number;
    status: OrderStatus;
    createdAt: Date;
  },
  runTag = '',
): InvoiceSeedInput {
  const amount = order.totalAmount;
  const taxAmount = Math.round(amount * IVA_RATE * 100) / 100;
  const totalAmount = Math.round((amount + taxAmount) * 100) / 100;
  const dueDate = rng.afterDate(order.createdAt, 25, 35);
  const status =
    order.status === OrderStatus.DELIVERED
      ? rng.pickWeighted<InvoiceStatus>([
          [InvoiceStatus.PAID, 70],
          [InvoiceStatus.SENT, 20],
          [InvoiceStatus.OVERDUE, 10],
        ])
      : rng.pickWeighted<InvoiceStatus>([
          [InvoiceStatus.PENDING, 60],
          [InvoiceStatus.SENT, 30],
          [InvoiceStatus.OVERDUE, 10],
        ]);

  const tag = runTag ? `${runTag}-` : '';
  return {
    invoiceNumber: `INV-SEED-${tag}${String(index + 1).padStart(6, '0')}`,
    orderId: order.id,
    amount,
    taxAmount,
    totalAmount,
    status,
    dianStatus: DianStatus.PENDING,
    dueDate,
    createdAt: rng.afterDate(order.createdAt, 0, 2),
  };
}

// ---------------------------------------------------------------------------
// Credit Validations — una por orden, correlacionada con el cliente real
// ---------------------------------------------------------------------------

export interface CreditValidationSeedInput {
  validationNumber: string;
  orderId: string;
  clientId: string;
  status: CreditValidationStatus;
  type: CreditValidationType;
  orderAmount: number;
  creditLimit: number;
  usedCredit: number;
  availableCredit: number;
  utilizationPercentage: number;
  isCreditSufficient: boolean;
  creditScore: number;
  decisionReason: string;
  validatedAt: Date;
  createdAt: Date;
}

export function buildCreditValidation(
  index: number,
  order: { id: string; totalAmount: number; createdAt: Date },
  client: ClientRef,
  runTag = '',
): CreditValidationSeedInput {
  const availableCredit = client.creditLimit - client.usedCredit;
  const isCreditSufficient = order.totalAmount <= availableCredit;
  const projectedUsed = client.usedCredit + order.totalAmount;
  const utilizationPercentage =
    client.creditLimit > 0
      ? Math.min(
          100,
          Math.round((projectedUsed / client.creditLimit) * 10000) / 100,
        )
      : 0;
  const creditScore = Math.max(
    0,
    Math.min(100, Math.round(100 - utilizationPercentage)),
  );
  const status = isCreditSufficient
    ? CreditValidationStatus.APPROVED
    : CreditValidationStatus.REJECTED;

  const tag = runTag ? `${runTag}-` : '';
  return {
    validationNumber: `CV-SEED-${tag}${String(index + 1).padStart(6, '0')}`,
    orderId: order.id,
    clientId: client.id,
    status,
    type: CreditValidationType.AUTOMATIC,
    orderAmount: order.totalAmount,
    creditLimit: client.creditLimit,
    usedCredit: client.usedCredit,
    availableCredit,
    utilizationPercentage,
    isCreditSufficient,
    creditScore,
    decisionReason: isCreditSufficient
      ? `Cupo suficiente: orden $${order.totalAmount.toLocaleString('es-CO')} dentro del disponible $${availableCredit.toLocaleString('es-CO')}.`
      : `Cupo insuficiente: orden $${order.totalAmount.toLocaleString('es-CO')} excede el disponible $${availableCredit.toLocaleString('es-CO')}.`,
    validatedAt: order.createdAt,
    createdAt: order.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Quotes + Quote Items (flujo independiente, mismo pool de clientes/productos)
// ---------------------------------------------------------------------------

export interface QuoteItemSeedInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}
export interface QuotePlan {
  quote: {
    quoteNumber: string;
    clientId: string;
    subtotal: number;
    taxAmount: number;
    total: number;
    status: QuoteStatus;
    createdAt: Date;
  };
  items: QuoteItemSeedInput[];
}

const QUOTE_STATUS_WEIGHTS: ReadonlyArray<readonly [QuoteStatus, number]> = [
  [QuoteStatus.RECEIVED, 10],
  [QuoteStatus.QUOTED, 15],
  [QuoteStatus.SENT, 20],
  [QuoteStatus.APPROVED, 20],
  [QuoteStatus.ORDERED, 10],
  [QuoteStatus.PAID, 10],
  [QuoteStatus.DELIVERED, 10],
  [QuoteStatus.REJECTED, 5],
];

export function buildQuotes(
  rng: SeededRandom,
  clients: ClientRef[],
  products: ProductRef[],
  count: number,
  runTag = '',
): QuotePlan[] {
  const tag = runTag ? `${runTag}-` : '';
  const out: QuotePlan[] = [];
  for (let i = 0; i < count; i++) {
    const client = rng.pick(clients);
    const itemCount = rng.int(1, 4);
    const items: QuoteItemSeedInput[] = [];
    let subtotal = 0;
    for (let j = 0; j < itemCount; j++) {
      const product = rng.pick(products);
      const quantity = rng.int(1, 30);
      const totalPrice = Math.round(product.price * quantity * 100) / 100;
      items.push({
        productId: product.id,
        quantity,
        unitPrice: product.price,
        totalPrice,
      });
      subtotal += totalPrice;
    }
    const taxAmount = Math.round(subtotal * IVA_RATE * 100) / 100;
    out.push({
      quote: {
        quoteNumber: `COT-SEED-${tag}${String(i + 1).padStart(6, '0')}`,
        clientId: client.id,
        subtotal: Math.round(subtotal * 100) / 100,
        taxAmount,
        total: Math.round((subtotal + taxAmount) * 100) / 100,
        status: rng.pickWeighted(QUOTE_STATUS_WEIGHTS),
        createdAt: rng.pastDate(180, 0),
      },
      items,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Production Orders — subconjunto de órdenes con estado de producción
// ---------------------------------------------------------------------------

const PRODUCTION_ELIGIBLE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PENDING_PRODUCTION,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.DELIVERED,
]);

export function isProductionEligible(status: OrderStatus): boolean {
  return PRODUCTION_ELIGIBLE_STATUSES.has(status);
}

export interface ProductionOrderSeedInput {
  productionOrderNumber: string;
  orderId: string;
  productId: string;
  status: ProductionOrderStatus;
  priority: ProductionPriority;
  quantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  productionLine: string;
  scheduledStartDate: Date;
  scheduledCompletionDate: Date;
  estimatedProductionTime: number;
  actualProductionTime: number;
  qualityChecksPassed: boolean;
  yieldPercentage: number;
  productionCost: number;
  createdAt: Date;
}

export function buildProductionOrder(
  rng: SeededRandom,
  index: number,
  order: { id: string; status: OrderStatus; createdAt: Date },
  item: OrderItemSeedInput,
  runTag = '',
): ProductionOrderSeedInput {
  const isDone =
    order.status === OrderStatus.DELIVERED ||
    order.status === OrderStatus.READY_FOR_DELIVERY;
  const completedQuantity = isDone
    ? item.quantity
    : Math.round(item.quantity * rng.float(0.2, 0.8));
  const poStatus = isDone
    ? ProductionOrderStatus.COMPLETED
    : rng.pickWeighted<ProductionOrderStatus>([
        [ProductionOrderStatus.IN_PROGRESS, 60],
        [ProductionOrderStatus.SCHEDULED, 30],
        [ProductionOrderStatus.ON_HOLD, 10],
      ]);
  const scheduledStart = rng.afterDate(order.createdAt, 0, 3);
  const tag = runTag ? `${runTag}-` : '';
  return {
    productionOrderNumber: `PO-SEED-${tag}${String(index + 1).padStart(6, '0')}`,
    orderId: order.id,
    productId: item.productId,
    status: poStatus,
    priority: rng.pickWeighted<ProductionPriority>([
      [ProductionPriority.NORMAL, 60],
      [ProductionPriority.HIGH, 25],
      [ProductionPriority.URGENT, 10],
      [ProductionPriority.LOW, 5],
    ]),
    quantity: item.quantity,
    completedQuantity,
    remainingQuantity: Math.max(0, item.quantity - completedQuantity),
    productionLine: rng.pick(['Línea A', 'Línea B', 'Línea C']),
    scheduledStartDate: scheduledStart,
    scheduledCompletionDate: rng.afterDate(scheduledStart, 3, 15),
    estimatedProductionTime: rng.int(8, 120),
    actualProductionTime: isDone ? rng.int(8, 130) : 0,
    qualityChecksPassed: isDone ? rng.bool(0.95) : false,
    yieldPercentage: isDone ? rng.float(85, 100) : 0,
    productionCost:
      Math.round(item.totalPrice * rng.float(0.3, 0.5) * 100) / 100,
    createdAt: order.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Export Operations — subconjunto de órdenes DELIVERED
// ---------------------------------------------------------------------------

export interface ExportOperationSeedInput {
  exportNumber: string;
  orderId: string;
  clientId: string;
  status: ExportOperationStatus;
  type: ExportType;
  destinationCountry: string;
  destinationPort: string;
  destinationAddress: string;
  incotermId: string;
  orderValue: number;
  liquidatedValue: number;
  totalCosts: number;
  totalRevenue: number;
  profitMargin: number;
  totalGrossWeight: number;
  totalNetWeight: number;
  totalVolume: number;
  totalPackages: number;
  containerType: string;
  containerNumber: string;
  expectedDepartureDate: Date;
  actualDepartureDate: Date;
  expectedArrivalDate: Date;
  actualArrivalDate: Date;
  customsCleared: boolean;
  requiresExportLicense: boolean;
  createdAt: Date;
}

export function buildExportOperation(
  rng: SeededRandom,
  index: number,
  order: { id: string; clientId: string; totalAmount: number; createdAt: Date },
  incotermIds: string[],
  runTag = '',
): ExportOperationSeedInput {
  const tag = runTag ? `${runTag}-` : '';
  const orderValue = order.totalAmount;
  const totalCosts = Math.round(orderValue * rng.float(0.1, 0.2) * 100) / 100;
  const liquidatedValue =
    Math.round(orderValue * rng.float(1.02, 1.1) * 100) / 100;
  const totalRevenue = liquidatedValue;
  const profitMargin =
    totalRevenue > 0
      ? Math.round(((totalRevenue - totalCosts) / totalRevenue) * 10000) / 100
      : 0;
  const departure = rng.afterDate(order.createdAt, 5, 20);
  const arrival = rng.afterDate(departure, 10, 25);

  return {
    exportNumber: `EXP-SEED-${tag}${String(index + 1).padStart(6, '0')}`,
    orderId: order.id,
    clientId: order.clientId,
    status: rng.pickWeighted<ExportOperationStatus>([
      [ExportOperationStatus.SHIPPED, 30],
      [ExportOperationStatus.DELIVERED, 40],
      [ExportOperationStatus.CONFIRMED, 15],
      [ExportOperationStatus.READY_FOR_SHIPMENT, 15],
    ]),
    type: rng.pickWeighted<ExportType>([
      [ExportType.STANDARD, 70],
      [ExportType.EXPRESS, 20],
      [ExportType.CONSOLIDATED, 10],
    ]),
    destinationCountry: rng.pick(DESTINATION_COUNTRIES),
    destinationPort: `Puerto de ${rng.pick(['Miami', 'Houston', 'Veracruz', 'Callao', 'Valparaíso'])}`,
    destinationAddress: `${rng.int(100, 999)} Logistics Ave, ${rng.pick(DESTINATION_COUNTRIES)}`,
    incotermId: rng.pick(incotermIds),
    orderValue,
    liquidatedValue,
    totalCosts,
    totalRevenue,
    profitMargin,
    totalGrossWeight: rng.float(500, 15000, 1),
    totalNetWeight: rng.float(450, 14000, 1),
    totalVolume: rng.float(10, 300, 1),
    totalPackages: rng.int(5, 200),
    containerType: rng.pick(['20GP', '40HC', '40GP']),
    containerNumber: `CBHU${rng.int(1000000, 9999999)}`,
    expectedDepartureDate: departure,
    actualDepartureDate: departure,
    expectedArrivalDate: arrival,
    actualArrivalDate: arrival,
    customsCleared: rng.bool(0.85),
    requiresExportLicense: rng.bool(0.15),
    createdAt: order.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Shipments + Tracking + Packing Lists — uno por export operation
// ---------------------------------------------------------------------------

export interface ShipmentSeedInput {
  shipmentNumber: string;
  orderId: string;
  exportOperationId: string;
  status: ShipmentStatus;
  type: ShipmentType;
  carrierType: CarrierType;
  origin: string;
  destination: string;
  carrier: string;
  trackingNumber: string;
  scheduledPickupDate: Date;
  actualPickupDate: Date;
  scheduledDeliveryDate: Date;
  actualDeliveryDate: Date | null;
  totalGrossWeight: number;
  totalNetWeight: number;
  totalVolume: number;
  totalPackages: number;
  shippingCost: number;
  currency: string;
  deliverySuccessful: boolean;
  createdAt: Date;
}

export function buildShipment(
  rng: SeededRandom,
  index: number,
  exportOp: ExportOperationSeedInput & { id: string },
  runTag = '',
): ShipmentSeedInput {
  const tag = runTag ? `${runTag}-` : '';
  const delivered = exportOp.status === ExportOperationStatus.DELIVERED;
  return {
    shipmentNumber: `SHP-SEED-${tag}${String(index + 1).padStart(6, '0')}`,
    orderId: exportOp.orderId,
    exportOperationId: exportOp.id,
    status: delivered ? ShipmentStatus.DELIVERED : ShipmentStatus.IN_TRANSIT,
    type: ShipmentType.EXPORT,
    carrierType: CarrierType.THIRD_PARTY,
    origin: 'Bogotá, Colombia',
    destination: exportOp.destinationCountry,
    carrier: rng.pick(CARRIERS),
    trackingNumber: `TRK${rng.int(100000000, 999999999)}`,
    scheduledPickupDate: exportOp.expectedDepartureDate,
    actualPickupDate: exportOp.actualDepartureDate,
    scheduledDeliveryDate: exportOp.expectedArrivalDate,
    actualDeliveryDate: delivered ? exportOp.actualArrivalDate : null,
    totalGrossWeight: exportOp.totalGrossWeight,
    totalNetWeight: exportOp.totalNetWeight,
    totalVolume: exportOp.totalVolume,
    totalPackages: exportOp.totalPackages,
    shippingCost:
      Math.round(exportOp.totalCosts * rng.float(0.4, 0.6) * 100) / 100,
    currency: 'USD',
    deliverySuccessful: delivered,
    createdAt: exportOp.createdAt,
  };
}

export interface ShipmentTrackingSeedInput {
  shipmentId: string;
  status: string;
  locationType: string;
  location: string;
  eventTimestamp: Date;
  details: string;
}

const TRACKING_STAGES: ReadonlyArray<readonly [string, string, string]> = [
  ['CREATED', 'ORIGIN', 'Bogotá, Colombia'],
  ['PICKED_UP', 'ORIGIN', 'Bogotá, Colombia'],
  ['IN_TRANSIT', 'HUB', 'Puerto de Cartagena'],
  ['CUSTOMS_CLEARANCE', 'CUSTOMS', 'Aduana de destino'],
  ['DELIVERED', 'DESTINATION', 'Bodega del cliente'],
];

export function buildShipmentTracking(
  rng: SeededRandom,
  shipment: { id: string; status: ShipmentStatus; createdAt: Date },
): ShipmentTrackingSeedInput[] {
  const upToIndex =
    shipment.status === ShipmentStatus.DELIVERED
      ? TRACKING_STAGES.length
      : rng.int(2, 3);
  const events: ShipmentTrackingSeedInput[] = [];
  let ts = new Date(shipment.createdAt);
  for (let i = 0; i < upToIndex; i++) {
    const [status, locationType, location] = TRACKING_STAGES[i];
    ts = rng.afterDate(ts, 1, 4);
    events.push({
      shipmentId: shipment.id,
      status,
      locationType,
      location,
      eventTimestamp: ts,
      details: `Evento ${status} registrado en ${location}`,
    });
  }
  return events;
}

export interface PackingListSeedInput {
  packingListNumber: string;
  orderId: string;
  status: PackingListStatus;
  type: PackingListType;
  totalItems: number;
  totalPackages: number;
  totalGrossWeight: number;
  totalNetWeight: number;
  totalVolume: number;
  warehouseLocation: string;
  packedAt: Date;
  qualityCheckPassed: boolean;
  createdAt: Date;
}

export function buildPackingList(
  rng: SeededRandom,
  index: number,
  exportOp: ExportOperationSeedInput,
  totalItemsInOrder: number,
  runTag = '',
): PackingListSeedInput {
  const tag = runTag ? `${runTag}-` : '';
  return {
    packingListNumber: `PL-SEED-${tag}${String(index + 1).padStart(6, '0')}`,
    orderId: exportOp.orderId,
    status: PackingListStatus.COMPLETED,
    type: PackingListType.EXPORT,
    totalItems: totalItemsInOrder,
    totalPackages: exportOp.totalPackages,
    totalGrossWeight: exportOp.totalGrossWeight,
    totalNetWeight: exportOp.totalNetWeight,
    totalVolume: exportOp.totalVolume,
    warehouseLocation: rng.pick(['Bodega A-01', 'Bodega A-02', 'Bodega B-01']),
    packedAt: rng.afterDate(exportOp.createdAt, 1, 5),
    qualityCheckPassed: rng.bool(0.95),
    createdAt: exportOp.createdAt,
  };
}
