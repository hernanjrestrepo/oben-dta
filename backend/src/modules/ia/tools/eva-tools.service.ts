import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientsService } from '../../clients/clients.service';
import { ProductsService } from '../../products/products.service';
import { OrdersService } from '../../orders/orders.service';
import { InvoicesService } from '../../invoices/invoices.service';
import { IntegrationsService } from '../../integrations/integrations.service';
import {
  CreditValidation,
  CreditValidationStatus,
  CreditValidationType,
} from '../../../entities/credit-validation.entity';
import { Order } from '../../../entities/order.entity';
import { TenantContext } from '../../../common/tenant/tenant-context.service';

/**
 * Tool Layer de EVA — las 5 herramientas que el LLM puede invocar.
 *
 * Reglas duras (misión DTA):
 * - Cero simulaciones. Cada tool golpea servicios/repositorios reales.
 * - Cero IDs ficticios. Toda numeración (orden, factura, validación) se deriva
 *   de un conteo real en PostgreSQL.
 * - GetClient/GetProduct devuelven found:false en lugar de lanzar, para que el
 *   orquestador LLM pueda reaccionar sin romper el flujo.
 *
 * Las herramientas aceptan identificadores de negocio (clientId tipo CLIENT-001,
 * sku tipo SKU-001) y resuelven internamente a los UUID de la base, de modo que
 * el modelo nunca tenga que inventar un UUID.
 */
@Injectable()
export class EvaToolsService {
  private readonly logger = new Logger(EvaToolsService.name);

  constructor(
    private readonly clientsService: ClientsService,
    private readonly productsService: ProductsService,
    private readonly ordersService: OrdersService,
    private readonly invoicesService: InvoicesService,
    private readonly integrations: IntegrationsService,
    @InjectRepository(CreditValidation)
    private readonly creditValidationRepository: Repository<CreditValidation>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly ctx: TenantContext,
  ) {}

  // ---------- 1. GetClient ----------
  async getClient(clientId: string): Promise<{
    found: boolean;
    id?: string;
    clientId?: string;
    name?: string;
    creditLimit?: number;
    usedCredit?: number;
    availableCredit?: number;
    isActive?: boolean;
  }> {
    try {
      const c = await this.clientsService.findByClientId(clientId);
      return {
        found: true,
        id: c.id,
        clientId: c.clientId,
        name: c.name,
        creditLimit: Number(c.creditLimit),
        usedCredit: Number(c.usedCredit),
        availableCredit: Number(c.creditLimit) - Number(c.usedCredit),
        isActive: c.isActive,
      };
    } catch {
      return { found: false };
    }
  }

  // ---------- 2. GetProduct ----------
  async getProduct(sku: string): Promise<{
    found: boolean;
    id?: string;
    sku?: string;
    name?: string;
    price?: number;
    stock?: number;
    committed?: number;
    available?: number;
    isActive?: boolean;
  }> {
    try {
      const p = await this.productsService.findBySku(sku);
      return {
        found: true,
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: Number(p.price),
        stock: p.stock,
        committed: p.committed,
        available: p.stock - p.committed,
        isActive: p.isActive,
      };
    } catch {
      return { found: false };
    }
  }

  // ---------- 3. ValidateCredit ----------
  // Persiste una fila REAL en credit_validations.
  async validateCredit(
    clientId: string,
    orderAmount: number,
    orderId?: string,
  ): Promise<{
    ok: boolean;
    validationNumber?: string;
    status?: string;
    creditLimit?: number;
    usedCredit?: number;
    availableCredit?: number;
    utilizationPercentage?: number;
    isCreditSufficient?: boolean;
    decisionReason: string;
  }> {
    const client = await this.getClient(clientId);
    if (!client.found || client.id === undefined) {
      return { ok: false, decisionReason: `Cliente ${clientId} no encontrado` };
    }

    const creditLimit = client.creditLimit ?? 0;
    const usedCredit = client.usedCredit ?? 0;
    const availableCredit = creditLimit - usedCredit;
    const isCreditSufficient = orderAmount <= availableCredit;
    const projectedUsed = usedCredit + orderAmount;
    const utilizationPercentage =
      creditLimit > 0
        ? this.round2(Math.min(100, (projectedUsed / creditLimit) * 100))
        : 0;
    const creditScore = Math.max(
      0,
      Math.min(100, Math.round(100 - utilizationPercentage)),
    );

    const status = isCreditSufficient
      ? CreditValidationStatus.APPROVED
      : CreditValidationStatus.REJECTED;

    const decisionReason = isCreditSufficient
      ? `Cupo suficiente: orden $${orderAmount.toLocaleString('es-CO')} dentro del disponible $${availableCredit.toLocaleString('es-CO')}.`
      : `Cupo insuficiente: orden $${orderAmount.toLocaleString('es-CO')} excede el disponible $${availableCredit.toLocaleString('es-CO')}.`;

    const validation = this.creditValidationRepository.create({
      validationNumber: await this.generateValidationNumber(),
      orderId: orderId ?? undefined,
      clientId: client.id,
      status,
      type: CreditValidationType.AUTOMATIC,
      orderAmount,
      creditLimit,
      usedCredit,
      availableCredit,
      utilizationPercentage,
      isCreditSufficient,
      creditScore,
      decisionReason,
      validatedAt: new Date(),
      tenantId: this.ctx.tenantId,
    });
    await this.creditValidationRepository.save(validation);

    return {
      ok: true,
      validationNumber: validation.validationNumber,
      status,
      creditLimit,
      usedCredit,
      availableCredit,
      utilizationPercentage,
      isCreditSufficient,
      decisionReason,
    };
  }

  // ---------- 4. CreateOrder ----------
  // Persiste Order + OrderItem[] reales vía OrdersService.create.
  async createOrder(
    clientId: string,
    items: { sku: string; qty: number }[],
    createdByUserId?: string,
    notes?: string,
  ): Promise<{
    ok: boolean;
    orderId?: string;
    orderNumber?: string;
    status?: string;
    totalAmount?: number;
    error?: string;
  }> {
    const client = await this.getClient(clientId);
    if (!client.found || client.id === undefined) {
      return { ok: false, error: `Cliente ${clientId} no encontrado` };
    }

    const resolvedItems: { productId: string; quantity: number }[] = [];
    for (const it of items) {
      const product = await this.getProduct(it.sku);
      if (!product.found || product.id === undefined) {
        return { ok: false, error: `Producto ${it.sku} no encontrado` };
      }
      resolvedItems.push({ productId: product.id, quantity: it.qty });
    }

    const order = await this.ordersService.create(
      {
        clientId: client.id,
        orderNumber: await this.generateOrderNumber(),
        items: resolvedItems,
        notes,
      },
      createdByUserId,
    );

    return {
      ok: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
    };
  }

  // ---------- 5. CreateInvoice ----------
  // Persiste una factura REAL vía InvoicesService.createFromOrder.
  async createInvoice(orderId: string): Promise<{
    ok: boolean;
    invoiceId?: string;
    invoiceNumber?: string;
    amount?: number;
    taxAmount?: number;
    totalAmount?: number;
    status?: string;
    dianStatus?: string;
    error?: string;
  }> {
    try {
      const inv = await this.invoicesService.createFromOrder({ orderId });
      return {
        ok: true,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: Number(inv.amount),
        taxAmount: Number(inv.taxAmount),
        totalAmount: Number(inv.totalAmount),
        status: inv.status,
        dianStatus: inv.dianStatus,
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  // ---------- Tools de integración (SOLO LECTURA, Integration Hub) ----------
  async getVendors(date: string) {
    const { result, vendors } = await this.integrations.getVendors(date);
    return {
      ok: result.ok,
      state: result.state,
      count: vendors.length,
      vendors,
      error: result.error,
    };
  }

  async getItems(date: string) {
    const { result, items } = await this.integrations.getItems(date);
    return {
      ok: result.ok,
      state: result.state,
      count: items.length,
      items,
      error: result.error,
    };
  }

  async getPurchaseOrders(date: string) {
    const { result, purchaseOrders } =
      await this.integrations.getPurchaseOrders(date);
    return {
      ok: result.ok,
      state: result.state,
      count: purchaseOrders.length,
      purchaseOrders,
      error: result.error,
    };
  }

  async getReceipts(date?: string, poNumber?: string) {
    const { result, receipts } = await this.integrations.getReceipts({
      date,
      poNumber,
    });
    return {
      ok: result.ok,
      state: result.state,
      count: receipts.length,
      receipts,
      error: result.error,
    };
  }

  async runSuiteQL(query: string) {
    const result = await this.integrations.runSuiteQL(query);
    return {
      ok: result.ok,
      state: result.state,
      data: result.data,
      error: result.error,
    };
  }

  // ---------- Despachador para el orquestador LLM (Fase 3) ----------
  async executeTool(
    name: string,
    args: Record<string, any>,
    ctx: { userId?: string } = {},
  ): Promise<unknown> {
    this.logger.log(`tool:${name} args=${JSON.stringify(args)}`);
    switch (name) {
      case 'GetClient':
        return this.getClient(args.clientId);
      case 'GetProduct':
        return this.getProduct(args.sku);
      case 'ValidateCredit':
        return this.validateCredit(
          args.clientId,
          Number(args.orderAmount),
          args.orderId,
        );
      case 'CreateOrder':
        return this.createOrder(
          args.clientId,
          args.items ?? [],
          ctx.userId,
          args.notes,
        );
      case 'CreateInvoice':
        return this.createInvoice(args.orderId);
      // Integration Hub (solo lectura)
      case 'GetVendors':
        return this.getVendors(args.date ?? '');
      case 'GetItems':
        return this.getItems(args.date ?? '');
      case 'GetPurchaseOrders':
        return this.getPurchaseOrders(args.date ?? '');
      case 'GetReceipts':
        return this.getReceipts(args.date, args.poNumber);
      case 'RunSuiteQL':
        return this.runSuiteQL(args.query ?? '');
      default:
        return { error: `Herramienta desconocida: ${name}` };
    }
  }

  // ---------- numeración derivada de DB real, por tenant ----------
  private async generateOrderNumber(): Promise<string> {
    const count = await this.orderRepository.count({
      where: { tenantId: this.ctx.tenantId },
    });
    const seq = String(count + 1).padStart(4, '0');
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `ORD-${datePart}-${seq}`;
  }

  private async generateValidationNumber(): Promise<string> {
    const count = await this.creditValidationRepository.count({
      where: { tenantId: this.ctx.tenantId },
    });
    const seq = String(count + 1).padStart(4, '0');
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `CV-${datePart}-${seq}`;
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
