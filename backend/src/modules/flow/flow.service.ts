import { Injectable } from '@nestjs/common';

// Datos mock realistas (duplicados aquí para independencia del módulo)
const PRODUCTS = [
  {
    sku: 'SKU-001',
    name: 'Tornillo hexagonal M8 x 50',
    stock: 100,
    committed: 20,
    price: 1000,
  },
  {
    sku: 'SKU-002',
    name: 'Tuerca autoblocante M8',
    stock: 50,
    committed: 10,
    price: 2000,
  },
];

const CLIENTS = [
  {
    clientId: 'CLIENT-001',
    name: 'Industrias del Norte S.A.S.',
    creditLimit: 100000,
    used: 40000,
  },
];

type OrderStatus = 'CONFIRMED' | 'PENDING_PRODUCTION' | 'BLOCKED';

export interface ProcessResult {
  step: string;
  parsed: {
    clientId: string;
    items: {
      sku: string;
      name: string;
      qty: number;
      unitPrice: number;
      total: number;
    }[];
  };
  creditCheck: {
    creditLimit: number;
    used: number;
    available: number;
    orderTotal: number;
    passed: boolean;
  };
  inventoryCheck: {
    sku: string;
    requested: number;
    available: number;
    passed: boolean;
  };
  decision: string;
  status: OrderStatus;
  order: { orderId: string; status: OrderStatus } | null;
  invoice: { invoiceId: string; status: string; dianStatus: string } | null;
}

@Injectable()
export class FlowService {
  private parseInput(text: string): { sku: string; qty: number } | null {
    const normalized = text.toLowerCase().trim();
    const match = normalized.match(
      /(?:quiero|necesito|pedir|solicito)\s+(\d+)\s+(sku-\d+)/,
    );
    if (!match) return null;
    return { qty: parseInt(match[1], 10), sku: match[2].toUpperCase() };
  }

  private findProduct(sku: string) {
    return PRODUCTS.find((p) => p.sku === sku) || null;
  }

  private findClient(clientId: string) {
    return CLIENTS.find((c) => c.clientId === clientId) || CLIENTS[0];
  }

  async processOrder(input: { text: string }): Promise<ProcessResult> {
    const text = input?.text || '';

    // 1. Interpretación del texto
    const parsedRaw = this.parseInput(text);
    if (!parsedRaw) {
      return {
        step: 'INTERPRETATION',
        parsed: { clientId: 'CLIENT-001', items: [] },
        creditCheck: {
          creditLimit: 0,
          used: 0,
          available: 0,
          orderTotal: 0,
          passed: false,
        },
        inventoryCheck: { sku: '', requested: 0, available: 0, passed: false },
        decision:
          'No se pudo interpretar el pedido. Use formato: "quiero 10 SKU-001"',
        status: 'BLOCKED',
        order: null,
        invoice: null,
      };
    }

    const product = this.findProduct(parsedRaw.sku);
    if (!product) {
      return {
        step: 'INTERPRETATION',
        parsed: { clientId: 'CLIENT-001', items: [] },
        creditCheck: {
          creditLimit: 0,
          used: 0,
          available: 0,
          orderTotal: 0,
          passed: false,
        },
        inventoryCheck: {
          sku: parsedRaw.sku,
          requested: parsedRaw.qty,
          available: 0,
          passed: false,
        },
        decision: `Producto ${parsedRaw.sku} no encontrado en catálogo.`,
        status: 'BLOCKED',
        order: null,
        invoice: null,
      };
    }

    const client = this.findClient('CLIENT-001');
    const availableStock = product.stock - product.committed;
    const orderTotal = parsedRaw.qty * product.price;
    const availableCredit = client.creditLimit - client.used;

    const parsed = {
      clientId: client.clientId,
      items: [
        {
          sku: product.sku,
          name: product.name,
          qty: parsedRaw.qty,
          unitPrice: product.price,
          total: orderTotal,
        },
      ],
    };

    // 2. Validación de crédito
    const creditPassed = orderTotal <= availableCredit;

    // 3. Validación de inventario
    const inventoryPassed = parsedRaw.qty <= availableStock;

    let status: OrderStatus;
    let decision: string;
    let order: { orderId: string; status: OrderStatus } | null = null;
    let invoice: {
      invoiceId: string;
      status: string;
      dianStatus: string;
    } | null = null;

    if (!creditPassed) {
      status = 'BLOCKED';
      decision = `Pedido bloqueado: total $${orderTotal.toLocaleString('es-CO')} excede cupo disponible $${availableCredit.toLocaleString('es-CO')}.`;
    } else if (!inventoryPassed) {
      status = 'PENDING_PRODUCTION';
      decision = `Inventario insuficiente: se necesitan ${parsedRaw.qty} unidades, disponibles ${availableStock}. El pedido pasa a producción.`;
      order = {
        orderId: 'ORD-' + Date.now(),
        status: 'PENDING_PRODUCTION' as OrderStatus,
      };
    } else {
      status = 'CONFIRMED';
      decision =
        'Cupo e inventario validados. Pedido confirmado y facturado automáticamente.';
      order = {
        orderId: 'ORD-' + Date.now(),
        status: 'CONFIRMED' as OrderStatus,
      };
      invoice = {
        invoiceId: 'INV-' + Date.now(),
        status: 'APPROVED',
        dianStatus: 'ACCEPTED',
      };
    }

    return {
      step: 'PROCESSING',
      parsed,
      creditCheck: {
        creditLimit: client.creditLimit,
        used: client.used,
        available: availableCredit,
        orderTotal,
        passed: creditPassed,
      },
      inventoryCheck: {
        sku: product.sku,
        requested: parsedRaw.qty,
        available: availableStock,
        passed: inventoryPassed,
      },
      decision,
      status,
      order,
      invoice,
    };
  }
}
