import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { Product } from '../entities/product.entity';
import { Client } from '../entities/client.entity';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import {
  ProductionOrder,
  ProductionOrderStatus,
} from '../entities/production-order.entity';
import { Shipment, ShipmentStatus } from '../entities/shipment.entity';
import { TenantContext } from '../common/tenant/tenant-context.service';

/**
 * DashboardService tenant-scoped. Devuelve KPIs derivados de datos reales
 * (órdenes, productos, clientes, facturas, producción, despachos). No hay
 * todavía módulos CRUD de Producción/Logística (solo el dataset generator
 * puebla esas tablas para demos) — los KPIs reflejan lo que exista en BD,
 * cero si el tenant no tiene datos, nunca un número inventado.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(Client) private clients: Repository<Client>,
    @InjectRepository(Invoice) private invoices: Repository<Invoice>,
    @InjectRepository(ProductionOrder)
    private productionOrders: Repository<ProductionOrder>,
    @InjectRepository(Shipment) private shipments: Repository<Shipment>,
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
      this.orders.count({
        where: { tenantId, createdAt: MoreThanOrEqual(startDate) },
      }),
      this.orders.count({
        where: {
          tenantId,
          status: OrderStatus.CONFIRMED,
          createdAt: MoreThanOrEqual(startDate),
        },
      }),
      this.orders.count({
        where: {
          tenantId,
          status: OrderStatus.DELIVERED,
          createdAt: MoreThanOrEqual(startDate),
        },
      }),
      this.orders.count({
        where: {
          tenantId,
          status: OrderStatus.CANCELLED,
          createdAt: MoreThanOrEqual(startDate),
        },
      }),
    ]);

    const revRow = await this.orders
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.totalAmount),0)', 'total')
      .addSelect('COALESCE(AVG(o.totalAmount),0)', 'avg')
      .where('o.tenant_id = :tenantId AND o.createdAt >= :startDate', {
        tenantId,
        startDate,
      })
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
      .where('p.tenant_id = :tenantId AND p.stock < 10 AND p.isActive = true', {
        tenantId,
      })
      .getCount();
    return { totalProducts, activeProducts, lowStockProducts: lowStock };
  }

  async getClientKPIs(days = 30) {
    const tenantId = this.ctx.tenantId;
    const startDate = this.since(days);
    const [totalClients, newClients] = await Promise.all([
      this.clients.count({ where: { tenantId } }),
      this.clients.count({
        where: { tenantId, createdAt: MoreThanOrEqual(startDate) },
      }),
    ]);
    return { totalClients, newClients };
  }

  async getFinanceKPIs(days = 30) {
    const tenantId = this.ctx.tenantId;
    const startDate = this.since(days);
    const [total, paid, pending] = await Promise.all([
      this.invoices.count({
        where: { tenantId, createdAt: MoreThanOrEqual(startDate) },
      }),
      this.invoices.count({
        where: {
          tenantId,
          status: InvoiceStatus.PAID,
          createdAt: MoreThanOrEqual(startDate),
        },
      }),
      this.invoices.count({
        where: {
          tenantId,
          status: InvoiceStatus.PENDING,
          createdAt: MoreThanOrEqual(startDate),
        },
      }),
    ]);
    return {
      totalInvoices: total,
      paidInvoices: paid,
      pendingInvoices: pending,
    };
  }

  async getProductionKPIs() {
    const tenantId = this.ctx.tenantId;
    const [total, completed, inProgress, onHold, cancelled] = await Promise.all(
      [
        this.productionOrders.count({ where: { tenantId } }),
        this.productionOrders.count({
          where: { tenantId, status: ProductionOrderStatus.COMPLETED },
        }),
        this.productionOrders.count({
          where: { tenantId, status: ProductionOrderStatus.IN_PROGRESS },
        }),
        this.productionOrders.count({
          where: { tenantId, status: ProductionOrderStatus.ON_HOLD },
        }),
        this.productionOrders.count({
          where: { tenantId, status: ProductionOrderStatus.CANCELLED },
        }),
      ],
    );
    return {
      totalOrders: total,
      completedOrders: completed,
      inProgressOrders: inProgress,
      onHoldOrders: onHold,
      cancelledOrders: cancelled,
      efficiency: total > 0 ? +((completed / total) * 100).toFixed(2) : 0,
    };
  }

  async getLogisticsKPIs() {
    const tenantId = this.ctx.tenantId;
    const [total, delivered, inTransit] = await Promise.all([
      this.shipments.count({ where: { tenantId } }),
      this.shipments.count({
        where: { tenantId, status: ShipmentStatus.DELIVERED },
      }),
      this.shipments
        .createQueryBuilder('s')
        .where('s.tenant_id = :tenantId AND s.status IN (:...statuses)', {
          tenantId,
          statuses: [
            ShipmentStatus.PICKED_UP,
            ShipmentStatus.IN_TRANSIT,
            ShipmentStatus.CUSTOMS_CLEARANCE,
            ShipmentStatus.OUT_FOR_DELIVERY,
          ],
        })
        .getCount(),
    ]);
    const delayed = await this.shipments
      .createQueryBuilder('s')
      .where(
        's.tenant_id = :tenantId AND s."scheduledDeliveryDate" < NOW() AND s."actualDeliveryDate" IS NULL',
        {
          tenantId,
        },
      )
      .getCount();
    return {
      totalShipments: total,
      deliveredShipments: delivered,
      inTransitShipments: inTransit,
      delayedShipments: delayed,
    };
  }

  getSystemKPIs() {
    // Sin sistema de eventos aún — Sección 6/7 de observabilidad lo define.
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
      system: this.getSystemKPIs(),
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
      .where('o.tenant_id = :tenantId AND o.createdAt >= :startDate', {
        tenantId,
        startDate,
      })
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
