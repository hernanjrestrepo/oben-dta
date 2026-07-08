import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { Product } from '../entities/product.entity';
import { Client } from '../entities/client.entity';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { TenantContext } from '../common/tenant/tenant-context.service';

/**
 * DashboardService tenant-scoped. Devuelve KPIs derivados de datos reales
 * (órdenes, productos, clientes, facturas). Los KPIs de producción, materiales y
 * exportaciones dependen de columnas todavía no migradas del modelo legacy y
 * se devuelven vacíos hasta que Bloque 8 (Observabilidad) los rediseñe.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(Client) private clients: Repository<Client>,
    @InjectRepository(Invoice) private invoices: Repository<Invoice>,
    private readonly ctx: TenantContext,
  ) {}

  private since(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }

  async getSalesKPIs(days = 30) {
    const tenantId = this.ctx.tenantId;
    const startDate = this.since(days);

    const [total, confirmed, delivered, cancelled] = await Promise.all([
      this.orders.count({ where: { tenantId, createdAt: MoreThanOrEqual(startDate) } }),
      this.orders.count({ where: { tenantId, status: OrderStatus.CONFIRMED, createdAt: MoreThanOrEqual(startDate) } }),
      this.orders.count({ where: { tenantId, status: OrderStatus.DELIVERED, createdAt: MoreThanOrEqual(startDate) } }),
      this.orders.count({ where: { tenantId, status: OrderStatus.CANCELLED, createdAt: MoreThanOrEqual(startDate) } }),
    ]);

    const revRow = await this.orders
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.totalAmount),0)', 'total')
      .addSelect('COALESCE(AVG(o.totalAmount),0)', 'avg')
      .where('o.tenant_id = :tenantId AND o.createdAt >= :startDate', { tenantId, startDate })
      .getRawOne<{ total: string; avg: string }>();

    return {
      totalOrders: total,
      confirmedOrders: confirmed,
      completedOrders: delivered,
      cancelledOrders: cancelled,
      fulfillmentRate: total > 0 ? +((delivered / total) * 100).toFixed(2) : 0,
      totalRevenue: +Number(revRow?.total ?? 0).toFixed(2),
      avgOrderValue: +Number(revRow?.avg ?? 0).toFixed(2),
    };
  }

  async getInventoryKPIs() {
    const tenantId = this.ctx.tenantId;
    const [totalProducts, activeProducts] = await Promise.all([
      this.products.count({ where: { tenantId } }),
      this.products.count({ where: { tenantId, isActive: true } }),
    ]);
    const lowStock = await this.products
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId AND p.stock < 10 AND p.isActive = true', { tenantId })
      .getCount();
    return { totalProducts, activeProducts, lowStockProducts: lowStock };
  }

  async getClientKPIs(days = 30) {
    const tenantId = this.ctx.tenantId;
    const startDate = this.since(days);
    const [totalClients, newClients] = await Promise.all([
      this.clients.count({ where: { tenantId } }),
      this.clients.count({ where: { tenantId, createdAt: MoreThanOrEqual(startDate) } }),
    ]);
    return { totalClients, newClients };
  }

  async getFinanceKPIs(days = 30) {
    const tenantId = this.ctx.tenantId;
    const startDate = this.since(days);
    const [total, paid, pending] = await Promise.all([
      this.invoices.count({ where: { tenantId, createdAt: MoreThanOrEqual(startDate) } }),
      this.invoices.count({ where: { tenantId, status: InvoiceStatus.PAID, createdAt: MoreThanOrEqual(startDate) } }),
      this.invoices.count({ where: { tenantId, status: InvoiceStatus.PENDING, createdAt: MoreThanOrEqual(startDate) } }),
    ]);
    return { totalInvoices: total, paidInvoices: paid, pendingInvoices: pending };
  }

  async getProductionKPIs() {
    // Rediseño en Bloque 8: devuelve estructura vacía por ahora.
    return {
      totalOrders: 0,
      completedOrders: 0,
      inProgressOrders: 0,
      onHoldOrders: 0,
      cancelledOrders: 0,
      efficiency: 0,
    };
  }

  async getLogisticsKPIs() {
    return {
      totalShipments: 0,
      deliveredShipments: 0,
      inTransitShipments: 0,
      delayedShipments: 0,
    };
  }

  async getSystemKPIs() {
    return { totalEvents: 0, errorEvents: 0 };
  }

  async getDashboardData(days = 30) {
    const [sales, inventory, clients, finance] = await Promise.all([
      this.getSalesKPIs(days),
      this.getInventoryKPIs(),
      this.getClientKPIs(days),
      this.getFinanceKPIs(days),
    ]);
    return {
      sales,
      inventory,
      clients,
      finance,
      production: await this.getProductionKPIs(),
      logistics: await this.getLogisticsKPIs(),
      system: await this.getSystemKPIs(),
      timestamp: new Date(),
    };
  }

  async getTrendData(kpi: string, days = 30) {
    if (kpi !== 'orders') return [];
    const tenantId = this.ctx.tenantId;
    const startDate = this.since(days);
    const rows = await this.orders
      .createQueryBuilder('o')
      .select("DATE_TRUNC('day', o.createdAt)", 'period')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(o.totalAmount),0)', 'value')
      .where('o.tenant_id = :tenantId AND o.createdAt >= :startDate', { tenantId, startDate })
      .groupBy("DATE_TRUNC('day', o.createdAt)")
      .orderBy('period', 'ASC')
      .getRawMany<{ period: string; count: string; value: string }>();
    return rows.map((r) => ({
      period: r.period,
      count: Number(r.count),
      value: Number(r.value),
    }));
  }
}
