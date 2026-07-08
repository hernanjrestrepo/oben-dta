/**
 * DISEÑO de las 5 herramientas (tool calling) que EVA podrá invocar.
 *
 * Estado: DISEÑO — NO implementado, NO registrado en ningún módulo.
 * Mapea 1:1 contra entidades/servicios reales ya existentes en TypeORM
 * (Client, Product, Order, OrderItem, CreditValidation, Invoice).
 *
 * Reglas de implementación futura (Fase 3):
 * - GetClient / GetProduct: solo lectura, reusan ClientsService/ProductsService.
 * - ValidateCredit: persiste una fila real en credit_validations (no es un cálculo
 *   en memoria) usando los campos ya definidos en CreditValidation entity.
 * - CreateOrder: delega en OrdersService.create() (ya persiste Order + OrderItem
 *   en una transacción real). El orderNumber se genera a partir de un conteo
 *   real en DB, nunca con un valor inventado sin respaldo en la tabla.
 * - CreateInvoice: requiere un InvoicesService nuevo (hoy no existe ningún
 *   service/controller para la entidad Invoice, solo el entity). Debe persistir
 *   en la tabla invoices con orderId real (FK), amount = order.totalAmount,
 *   taxAmount = amount * IVA_RATE, totalAmount = amount + taxAmount.
 */

// ---------- 1. GetClient ----------
export interface GetClientInput {
  clientId: string; // business clientId (p.ej. "CLIENT-001"), no el UUID interno
}

export interface GetClientOutput {
  id: string; // UUID interno
  clientId: string;
  name: string;
  creditLimit: number;
  usedCredit: number;
  availableCredit: number; // derivado: creditLimit - usedCredit
  isActive: boolean;
  found: boolean;
}

// ---------- 2. GetProduct ----------
export interface GetProductInput {
  sku: string;
}

export interface GetProductOutput {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  committed: number;
  available: number; // derivado: stock - committed
  isActive: boolean;
  found: boolean;
}

// ---------- 3. ValidateCredit ----------
// Persiste una fila real en credit_validations (CreditValidationStatus / Type
// ya definidos en credit-validation.entity.ts). No es un check en memoria.
export interface ValidateCreditInput {
  clientId: string; // UUID interno del cliente
  orderId?: string; // UUID de la orden si ya existe (puede validarse antes de crear la orden)
  orderAmount: number;
}

export interface ValidateCreditOutput {
  validationNumber: string; // generado a partir de un conteo real en DB (CV-<seq>)
  status: 'APPROVED' | 'REJECTED' | 'ESCALATED';
  creditLimit: number;
  usedCredit: number;
  availableCredit: number;
  utilizationPercentage: number;
  isCreditSufficient: boolean;
  decisionReason: string;
}

// ---------- 4. CreateOrder ----------
// Delega en OrdersService.create(dto, userId) ya existente — persiste
// Order + OrderItem[] en transacción real.
export interface CreateOrderInput {
  clientId: string; // UUID interno
  items: { productId: string; quantity: number }[];
  notes?: string;
  createdByUserId: string;
}

export interface CreateOrderOutput {
  orderId: string; // UUID real, fila persistida
  orderNumber: string; // generado desde conteo real en DB, p.ej. ORD-20260622-0007
  status: string;
  totalAmount: number;
}

// ---------- 5. CreateInvoice ----------
// Requiere InvoicesService nuevo (Fase 3): no existe hoy.
export interface CreateInvoiceInput {
  orderId: string; // UUID de una orden ya persistida y CONFIRMED
}

export interface CreateInvoiceOutput {
  invoiceId: string; // UUID real, fila persistida en invoices
  invoiceNumber: string; // generado desde conteo real en DB, p.ej. INV-20260622-0003
  amount: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
  dianStatus: string;
}

export const EVA_TOOL_SPECS = [
  {
    name: 'GetClient',
    description: 'Busca un cliente real por su clientId de negocio (ej. CLIENT-001).',
  },
  {
    name: 'GetProduct',
    description: 'Busca un producto real por SKU.',
  },
  {
    name: 'ValidateCredit',
    description:
      'Valida el cupo de crédito de un cliente contra el monto de una orden y persiste el resultado en credit_validations.',
  },
  {
    name: 'CreateOrder',
    description:
      'Crea una orden real (con sus items) en PostgreSQL. Nunca genera un orderId ficticio sin persistir.',
  },
  {
    name: 'CreateInvoice',
    description:
      'Crea una factura real en PostgreSQL para una orden CONFIRMED. Nunca genera un invoiceId ficticio sin persistir.',
  },
] as const;
