import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  Invoice,
  InvoiceStatus,
  DianStatus,
} from '../../entities/invoice.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import {
  CreateInvoiceDto,
  UpdateInvoiceStatusDto,
} from './dto/create-invoice.dto';
import { TenantContext } from '../../common/tenant/tenant-context.service';

// IVA por defecto. El valor real debe leerse por tenant desde tenants.settings.taxRate
// (implementado como fallback aquí hasta que Config/Impuestos sea un módulo propio).
const DEFAULT_IVA_RATE = 0.19;

// Días de plazo de pago por defecto al emitir la factura.
const PAYMENT_TERM_DAYS = 30;

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private readonly ctx: TenantContext,
  ) {}

  async createFromOrder(dto: CreateInvoiceDto): Promise<Invoice> {
    const tenantId = this.ctx.tenantId;
    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId, tenantId },
      relations: ['client', 'items'],
    });
    if (!order)
      throw new NotFoundException(`Orden ${dto.orderId} no encontrada`);

    if (
      order.status === OrderStatus.BLOCKED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `La orden ${order.orderNumber} está en estado ${order.status} y no puede facturarse`,
      );
    }

    const existing = await this.invoiceRepository.findOne({
      where: { orderId: order.id, tenantId },
    });
    if (existing) {
      throw new ConflictException(
        `La orden ${order.orderNumber} ya tiene la factura ${existing.invoiceNumber}`,
      );
    }

    const amount = Number(order.totalAmount);
    const taxAmount = this.round2(amount * DEFAULT_IVA_RATE);
    const totalAmount = this.round2(amount + taxAmount);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + PAYMENT_TERM_DAYS);

    const saved = await this.saveWithUniqueRetry(async () => {
      const invoice = this.invoiceRepository.create({
        invoiceNumber: await this.generateInvoiceNumber(tenantId),
        order,
        orderId: order.id,
        amount,
        taxAmount,
        totalAmount,
        status: InvoiceStatus.PENDING,
        dianStatus: DianStatus.PENDING,
        dueDate,
        tenantId,
      });
      return this.invoiceRepository.save(invoice);
    }, order.orderNumber);

    order.invoiceNumber = saved.invoiceNumber;
    await this.orderRepository.save(order);

    return saved;
  }

  /**
   * generateInvoiceNumber() cuenta filas y luego inserta — no es atómico.
   * Bajo concurrencia real (dos pagos confirmándose casi al mismo tiempo,
   * reproducido en pruebas con la demo automática) dos llamadas pueden
   * calcular el mismo número; Postgres rechaza la segunda inserción por la
   * restricción única (tenantId, invoiceNumber) y aquí se reintenta con un
   * número recalculado. Si la colisión es por (tenantId, orderId) — la orden
   * ya fue facturada por otra llamada concurrente — no se reintenta, es un
   * conflicto de negocio real, no una colisión de numeración.
   */
  private async saveWithUniqueRetry(
    attempt: () => Promise<Invoice>,
    orderNumber: string,
    maxAttempts = 5,
  ): Promise<Invoice> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await attempt();
      } catch (err) {
        const constraint = this.uniqueViolationConstraint(err);
        if (constraint === 'uq_invoices_tenant_order') {
          throw new ConflictException(
            `La orden ${orderNumber} ya tiene una factura generada por otra operación concurrente.`,
          );
        }
        if (constraint === 'uq_invoices_tenant_number' && i < maxAttempts - 1) {
          continue;
        }
        throw err;
      }
    }
    throw new ConflictException(
      `No fue posible generar un número de factura único para la orden ${orderNumber} tras varios intentos.`,
    );
  }

  private uniqueViolationConstraint(err: unknown): string | null {
    if (!(err instanceof QueryFailedError)) return null;
    const driverErr = err as unknown as { code?: string; constraint?: string };
    if (driverErr.code !== '23505') return null;
    return driverErr.constraint ?? null;
  }

  async findAll(page: number = 1, limit: number = 50): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      where: { tenantId: this.ctx.tenantId },
      relations: ['order', 'order.client'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id, tenantId: this.ctx.tenantId },
      relations: ['order', 'order.client'],
    });
    if (!invoice) throw new NotFoundException(`Factura ${id} no encontrada`);
    return invoice;
  }

  async findByOrderId(orderId: string): Promise<Invoice | null> {
    return this.invoiceRepository.findOne({
      where: { orderId, tenantId: this.ctx.tenantId },
      relations: ['order', 'order.client'],
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateInvoiceStatusDto,
  ): Promise<Invoice> {
    const invoice = await this.findOne(id);
    invoice.status = dto.status;
    if (dto.status === InvoiceStatus.PAID) {
      invoice.paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    }
    return this.invoiceRepository.save(invoice);
  }

  /**
   * Numeración por tenant: INV-YYYYMMDD-NNNN donde NNNN es el conteo de facturas
   * del tenant + 1. Nunca es un valor inventado.
   */
  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const count = await this.invoiceRepository.count({ where: { tenantId } });
    const seq = String(count + 1).padStart(4, '0');
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `INV-${datePart}-${seq}`;
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
