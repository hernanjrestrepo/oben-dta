import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, In } from 'typeorm';
import {
  ProductionOrder,
  ProductionOrderStatus,
} from '../entities/production-order.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import {
  CreditValidation,
  CreditValidationStatus,
} from '../entities/credit-validation.entity';
import { Shipment, ShipmentStatus } from '../entities/shipment.entity';
import {
  ExportOperation,
  ExportOperationStatus,
} from '../entities/export-operation.entity';
import { Product } from '../entities/product.entity';
import { Client } from '../entities/client.entity';
import { AuditEvent, AuditEventType } from '../entities/audit-event.entity';
import { MaterialConsumption } from '../entities/material-consumption.entity';
import { RawMaterialConsumption } from '../entities/raw-material-consumption.entity';
import { PackagingConsumption } from '../entities/packaging-consumption.entity';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(ProductionOrder)
    private productionOrderRepository: Repository<ProductionOrder>,

    @InjectRepository(Order)
    private orderRepository: Repository<Order>,

    @InjectRepository(CreditValidation)
    private creditValidationRepository: Repository<CreditValidation>,

    @InjectRepository(Shipment)
    private shipmentRepository: Repository<Shipment>,

    @InjectRepository(ExportOperation)
    private exportOperationRepository: Repository<ExportOperation>,

    @InjectRepository(Product)
    private productRepository: Repository<Product>,

    @InjectRepository(Client)
    private clientRepository: Repository<Client>,

    @InjectRepository(AuditEvent)
    private auditEventRepository: Repository<AuditEvent>,

    @InjectRepository(MaterialConsumption)
    private materialConsumptionRepository: Repository<MaterialConsumption>,

    @InjectRepository(RawMaterialConsumption)
    private rawMaterialConsumptionRepository: Repository<RawMaterialConsumption>,

    @InjectRepository(PackagingConsumption)
    private packagingConsumptionRepository: Repository<PackagingConsumption>,
  ) {}

  /**
   * Get production KPIs
   */
  async getProductionKPIs(days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Total production orders
      const totalOrders = await this.productionOrderRepository.count({
        where: {
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // Completed production orders
      const completedOrders = await this.productionOrderRepository.count({
        where: {
          status: ProductionOrderStatus.COMPLETED,
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // In progress production orders
      const inProgressOrders = await this.productionOrderRepository.count({
        where: {
          status: ProductionOrderStatus.IN_PROGRESS,
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // On hold production orders
      const onHoldOrders = await this.productionOrderRepository.count({
        where: {
          status: ProductionOrderStatus.ON_HOLD,
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // Cancelled production orders
      const cancelledOrders = await this.productionOrderRepository.count({
        where: {
          status: ProductionOrderStatus.CANCELLED,
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // Production efficiency (completed vs total)
      const efficiency =
        totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

      // Average yield percentage
      const avgYieldResult = await this.productionOrderRepository
        .createQueryBuilder('po')
        .select('AVG(po.yieldPercentage)', 'avgYield')
        .where('po.createdAt >= :startDate', { startDate })
        .getRawOne();

      const avgYield = parseFloat(avgYieldResult?.avgYield) || 0;

      // Material consumption analysis
      const rawMaterialWaste = await this.rawMaterialConsumptionRepository
        .createQueryBuilder('rmc')
        .select('SUM(rmc.actualConsumption * rmc.actualCost)', 'totalCost')
        .addSelect('SUM(rmc.wastedQuantity * rmc.actualCost)', 'wasteCost')
        .where('rmc.createdAt >= :startDate', { startDate })
        .getRawOne();

      const packagingWaste = await this.packagingConsumptionRepository
        .createQueryBuilder('pc')
        .select('SUM(pc.actualConsumption * pc.actualCost)', 'totalCost')
        .addSelect('SUM(pc.wastedQuantity * pc.actualCost)', 'wasteCost')
        .where('pc.createdAt >= :startDate', { startDate })
        .getRawOne();

      const totalMaterialCost =
        (parseFloat(rawMaterialWaste?.totalCost) || 0) +
        (parseFloat(packagingWaste?.totalCost) || 0);
      const totalWasteCost =
        (parseFloat(rawMaterialWaste?.wasteCost) || 0) +
        (parseFloat(packagingWaste?.wasteCost) || 0);
      const wastePercentage =
        totalMaterialCost > 0 ? (totalWasteCost / totalMaterialCost) * 100 : 0;

      return {
        totalOrders,
        completedOrders,
        inProgressOrders,
        onHoldOrders,
        cancelledOrders,
        efficiency: parseFloat(efficiency.toFixed(2)),
        avgYield: parseFloat(avgYield.toFixed(2)),
        totalMaterialCost: parseFloat(totalMaterialCost.toFixed(2)),
        totalWasteCost: parseFloat(totalWasteCost.toFixed(2)),
        wastePercentage: parseFloat(wastePercentage.toFixed(2)),
      };
    } catch (error) {
      this.logger.error(
        `Error getting production KPIs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get sales and orders KPIs
   */
  async getSalesKPIs(days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Total orders
      const totalOrders = await this.orderRepository.count({
        where: {
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // Approved orders (using CONFIRMED status as equivalent)
      const approvedOrders = await this.orderRepository.count({
        where: {
          status: OrderStatus.CONFIRMED,
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // Confirmed orders
      const confirmedOrders = await this.orderRepository.count({
        where: {
          status: OrderStatus.CONFIRMED,
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // Completed orders (using DELIVERED status)
      const completedOrders = await this.orderRepository.count({
        where: {
          status: OrderStatus.DELIVERED,
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // Cancelled orders
      const cancelledOrders = await this.orderRepository.count({
        where: {
          status: OrderStatus.CANCELLED,
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // Order fulfillment rate
      const fulfillmentRate =
        totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

      // Revenue analysis
      const revenueResult = await this.orderRepository
        .createQueryBuilder('o')
        .select('SUM(o.totalAmount)', 'totalRevenue')
        .addSelect('AVG(o.totalAmount)', 'avgOrderValue')
        .where('o.createdAt >= :startDate', { startDate })
        .getRawOne();

      const totalRevenue = parseFloat(revenueResult?.totalRevenue) || 0;
      const avgOrderValue = parseFloat(revenueResult?.avgOrderValue) || 0;

      // Credit validation analysis
      const creditValidations = await this.creditValidationRepository
        .createQueryBuilder('cv')
        .select('COUNT(*)', 'total')
        .addSelect(
          "SUM(CASE WHEN cv.status = 'APPROVED' THEN 1 ELSE 0 END)",
          'approved',
        )
        .addSelect(
          "SUM(CASE WHEN cv.status = 'REJECTED' THEN 1 ELSE 0 END)",
          'rejected',
        )
        .where('cv.createdAt >= :startDate', { startDate })
        .getRawOne();

      const totalValidations = parseInt(creditValidations?.total) || 0;
      const approvedValidations = parseInt(creditValidations?.approved) || 0;
      const rejectedValidations = parseInt(creditValidations?.rejected) || 0;
      const approvalRate =
        totalValidations > 0
          ? (approvedValidations / totalValidations) * 100
          : 0;

      return {
        totalOrders,
        approvedOrders,
        confirmedOrders,
        completedOrders,
        cancelledOrders,
        fulfillmentRate: parseFloat(fulfillmentRate.toFixed(2)),
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
        totalValidations,
        approvedValidations,
        rejectedValidations,
        approvalRate: parseFloat(approvalRate.toFixed(2)),
      };
    } catch (error) {
      this.logger.error(
        `Error getting sales KPIs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get logistics and shipping KPIs
   */
  async getLogisticsKPIs(days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Total shipments
      const totalShipments = await this.shipmentRepository.count({
        where: {
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // Delivered shipments
      const deliveredShipments = await this.shipmentRepository.count({
        where: {
          status: ShipmentStatus.DELIVERED,
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // In transit shipments
      const inTransitShipments = await this.shipmentRepository.count({
        where: {
          status: ShipmentStatus.IN_TRANSIT,
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // Delayed shipments
      const delayedShipments = await this.shipmentRepository
        .createQueryBuilder('s')
        .where('s.scheduledDeliveryDate < :now', { now: new Date() })
        .andWhere('s.status != :delivered', {
          delivered: ShipmentStatus.DELIVERED,
        })
        .andWhere('s.createdAt >= :startDate', { startDate })
        .getCount();

      // On time delivery rate
      const onTimeDeliveryRate =
        totalShipments > 0 ? (deliveredShipments / totalShipments) * 100 : 0;

      // Average shipping time
      const avgShippingTimeResult = await this.shipmentRepository
        .createQueryBuilder('s')
        .select(
          'AVG(EXTRACT(EPOCH FROM (s.actualDeliveryDate - s.actualPickupDate)) / 3600)',
          'avgHours',
        )
        .where('s.actualDeliveryDate IS NOT NULL')
        .andWhere('s.actualPickupDate IS NOT NULL')
        .andWhere('s.createdAt >= :startDate', { startDate })
        .getRawOne();

      const avgShippingTime = parseFloat(avgShippingTimeResult?.avgHours) || 0;

      // Export operations analysis
      const exportOperations = await this.exportOperationRepository
        .createQueryBuilder('eo')
        .select('COUNT(*)', 'total')
        .addSelect(
          "SUM(CASE WHEN eo.status = 'DELIVERED' THEN 1 ELSE 0 END)",
          'completed',
        )
        .addSelect('SUM(eo.totalRevenue)', 'totalValue')
        .where('eo.createdAt >= :startDate', { startDate })
        .getRawOne();

      const totalExports = parseInt(exportOperations?.total) || 0;
      const completedExports = parseInt(exportOperations?.completed) || 0;
      const totalExportValue = parseFloat(exportOperations?.totalValue) || 0;
      const exportCompletionRate =
        totalExports > 0 ? (completedExports / totalExports) * 100 : 0;

      return {
        totalShipments,
        deliveredShipments,
        inTransitShipments,
        delayedShipments,
        onTimeDeliveryRate: parseFloat(onTimeDeliveryRate.toFixed(2)),
        avgShippingTime: parseFloat(avgShippingTime.toFixed(2)), // in hours
        totalExports,
        completedExports,
        totalExportValue: parseFloat(totalExportValue.toFixed(2)),
        exportCompletionRate: parseFloat(exportCompletionRate.toFixed(2)),
      };
    } catch (error) {
      this.logger.error(
        `Error getting logistics KPIs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get inventory and materials KPIs
   */
  async getInventoryKPIs(days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Total products
      const totalProducts = await this.productRepository.count();

      // Active products
      const activeProducts = await this.productRepository.count({
        where: {
          isActive: true,
        },
      });

      // Low stock products (assuming low stock is less than 10 units)
      const lowStockProducts = await this.productRepository
        .createQueryBuilder('p')
        .where('p.stock < 10')
        .andWhere('p.isActive = true')
        .getCount();

      // Material consumption analysis
      const rawMaterialConsumption = await this.rawMaterialConsumptionRepository
        .createQueryBuilder('rmc')
        .select('SUM(rmc.actualConsumption * rmc.actualCost)', 'totalCost')
        .addSelect('SUM(rmc.wastedQuantity * rmc.actualCost)', 'wasteCost')
        .where('rmc.createdAt >= :startDate', { startDate })
        .getRawOne();

      const totalRawMaterialCost =
        parseFloat(rawMaterialConsumption?.totalCost) || 0;
      const rawMaterialWasteCost =
        parseFloat(rawMaterialConsumption?.wasteCost) || 0;
      const rawMaterialWastePercentage =
        totalRawMaterialCost > 0
          ? (rawMaterialWasteCost / totalRawMaterialCost) * 100
          : 0;

      // Packaging consumption analysis
      const packagingConsumption = await this.packagingConsumptionRepository
        .createQueryBuilder('pc')
        .select('SUM(pc.actualConsumption * pc.actualCost)', 'totalCost')
        .addSelect('SUM(pc.wastedQuantity * pc.actualCost)', 'wasteCost')
        .where('pc.createdAt >= :startDate', { startDate })
        .getRawOne();

      const totalPackagingCost =
        parseFloat(packagingConsumption?.totalCost) || 0;
      const packagingWasteCost =
        parseFloat(packagingConsumption?.wasteCost) || 0;
      const packagingWastePercentage =
        totalPackagingCost > 0
          ? (packagingWasteCost / totalPackagingCost) * 100
          : 0;

      // Overall material waste percentage
      const totalMaterialCost = totalRawMaterialCost + totalPackagingCost;
      const totalWasteCost = rawMaterialWasteCost + packagingWasteCost;
      const overallWastePercentage =
        totalMaterialCost > 0 ? (totalWasteCost / totalMaterialCost) * 100 : 0;

      return {
        totalProducts,
        activeProducts,
        lowStockProducts,
        totalRawMaterialCost: parseFloat(totalRawMaterialCost.toFixed(2)),
        rawMaterialWasteCost: parseFloat(rawMaterialWasteCost.toFixed(2)),
        rawMaterialWastePercentage: parseFloat(
          rawMaterialWastePercentage.toFixed(2),
        ),
        totalPackagingCost: parseFloat(totalPackagingCost.toFixed(2)),
        packagingWasteCost: parseFloat(packagingWasteCost.toFixed(2)),
        packagingWastePercentage: parseFloat(
          packagingWastePercentage.toFixed(2),
        ),
        totalMaterialCost: parseFloat(totalMaterialCost.toFixed(2)),
        totalWasteCost: parseFloat(totalWasteCost.toFixed(2)),
        overallWastePercentage: parseFloat(overallWastePercentage.toFixed(2)),
      };
    } catch (error) {
      this.logger.error(
        `Error getting inventory KPIs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get client and market KPIs
   */
  async getClientKPIs(days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Total clients
      const totalClients = await this.clientRepository.count();

      // Active clients (with recent orders)
      const activeClients = await this.clientRepository
        .createQueryBuilder('c')
        .innerJoin('c.orders', 'o')
        .where('o.createdAt >= :startDate', { startDate })
        .getCount();

      // New clients
      const newClients = await this.clientRepository.count({
        where: {
          createdAt: MoreThanOrEqual(startDate),
        },
      });

      // Client retention rate (simplified)
      const retentionRate =
        totalClients > 0 ? (activeClients / totalClients) * 100 : 0;

      // Top clients by revenue
      const topClients = await this.orderRepository
        .createQueryBuilder('o')
        .select('o.clientId', 'customerId')
        .addSelect('c.name', 'clientName')
        .addSelect('SUM(o.totalAmount)', 'totalRevenue')
        .innerJoin('o.client', 'c')
        .where('o.createdAt >= :startDate', { startDate })
        .groupBy('o.clientId, c.name')
        .orderBy('SUM(o.totalAmount)', 'DESC')
        .limit(5)
        .getRawMany();

      return {
        totalClients,
        activeClients,
        newClients,
        retentionRate: parseFloat(retentionRate.toFixed(2)),
        topClients: topClients.map((client) => ({
          clientId: client.customerId,
          clientName: client.clientName,
          totalRevenue: parseFloat(client.totalRevenue).toFixed(2),
        })),
      };
    } catch (error) {
      this.logger.error(
        `Error getting client KPIs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get system and security KPIs
   */
  async getSystemKPIs(days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Total audit events
      const totalEvents = await this.auditEventRepository.count({
        where: {
          timestamp: MoreThanOrEqual(startDate),
        },
      });

      // Security events
      const securityEvents = await this.auditEventRepository.count({
        where: {
          eventType: In([
            AuditEventType.USER_LOGIN,
            AuditEventType.USER_LOGOUT,
            AuditEventType.SECURITY_VIOLATION,
          ]),
          timestamp: MoreThanOrEqual(startDate),
        },
      });

      // Data events
      const dataEvents = await this.auditEventRepository.count({
        where: {
          eventType: In([
            AuditEventType.DATA_ACCESS,
            AuditEventType.DATA_MODIFICATION,
            AuditEventType.DATA_DELETION,
          ]),
          timestamp: MoreThanOrEqual(startDate),
        },
      });

      // Business events
      const businessEvents = await this.auditEventRepository.count({
        where: {
          eventType: In([
            AuditEventType.ORDER_CREATED,
            AuditEventType.ORDER_APPROVED,
            AuditEventType.QUOTE_APPROVED,
            AuditEventType.INVOICE_GENERATED,
            AuditEventType.PAYMENT_RECEIVED,
            AuditEventType.SHIPMENT_DELIVERED,
          ]),
          timestamp: MoreThanOrEqual(startDate),
        },
      });

      // Error events
      const errorEvents = await this.auditEventRepository.count({
        where: {
          isError: true,
          timestamp: MoreThanOrEqual(startDate),
        },
      });

      // Recent errors
      const recentErrors = await this.auditEventRepository.find({
        where: {
          isError: true,
          timestamp: MoreThanOrEqual(startDate),
        },
        order: {
          timestamp: 'DESC',
        },
        take: 5,
      });

      // System uptime (simplified - based on startup/shutdown events)
      const systemEvents = await this.auditEventRepository.count({
        where: {
          eventType: In([
            AuditEventType.SYSTEM_STARTUP,
            AuditEventType.SYSTEM_SHUTDOWN,
          ]),
          timestamp: MoreThanOrEqual(startDate),
        },
      });

      return {
        totalEvents,
        securityEvents,
        dataEvents,
        businessEvents,
        errorEvents,
        recentErrors: recentErrors.map((error) => ({
          id: error.id,
          eventType: error.eventType,
          message: error.errorMessage,
          timestamp: error.timestamp,
        })),
        systemEvents,
      };
    } catch (error) {
      this.logger.error(
        `Error getting system KPIs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData(days: number = 30): Promise<any> {
    try {
      const [
        productionKPIs,
        salesKPIs,
        logisticsKPIs,
        inventoryKPIs,
        clientKPIs,
        systemKPIs,
      ] = await Promise.all([
        this.getProductionKPIs(days),
        this.getSalesKPIs(days),
        this.getLogisticsKPIs(days),
        this.getInventoryKPIs(days),
        this.getClientKPIs(days),
        this.getSystemKPIs(days),
      ]);

      return {
        production: productionKPIs,
        sales: salesKPIs,
        logistics: logisticsKPIs,
        inventory: inventoryKPIs,
        clients: clientKPIs,
        system: systemKPIs,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Error getting dashboard data: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get trend data for a specific KPI over time
   */
  async getTrendData(
    kpi: string,
    days: number = 30,
    interval: 'day' | 'week' | 'month' = 'day',
  ): Promise<any[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      let queryBuilder;
      let dateTrunc;

      switch (interval) {
        case 'day':
          dateTrunc = 'day';
          break;
        case 'week':
          dateTrunc = 'week';
          break;
        case 'month':
          dateTrunc = 'month';
          break;
      }

      switch (kpi) {
        case 'orders':
          queryBuilder = this.orderRepository
            .createQueryBuilder('o')
            .select(`DATE_TRUNC('${dateTrunc}', o.createdAt)`, 'period')
            .addSelect('COUNT(*)', 'count')
            .addSelect('SUM(o.totalAmount)', 'value')
            .where('o.createdAt >= :startDate', { startDate })
            .groupBy(`DATE_TRUNC('${dateTrunc}', o.createdAt)`)
            .orderBy('period', 'ASC');
          break;

        case 'shipments':
          queryBuilder = this.shipmentRepository
            .createQueryBuilder('s')
            .select(`DATE_TRUNC('${dateTrunc}', s.createdAt)`, 'period')
            .addSelect('COUNT(*)', 'count')
            .where('s.createdAt >= :startDate', { startDate })
            .groupBy(`DATE_TRUNC('${dateTrunc}', s.createdAt)`)
            .orderBy('period', 'ASC');
          break;

        case 'production':
          queryBuilder = this.productionOrderRepository
            .createQueryBuilder('po')
            .select(`DATE_TRUNC('${dateTrunc}', po.createdAt)`, 'period')
            .addSelect('COUNT(*)', 'count')
            .where('po.createdAt >= :startDate', { startDate })
            .groupBy(`DATE_TRUNC('${dateTrunc}', po.createdAt)`)
            .orderBy('period', 'ASC');
          break;

        default:
          return [];
      }

      const results = await queryBuilder.getRawMany();
      return results.map((result) => ({
        period: result.period,
        count: parseInt(result.count),
        value: parseFloat(result.value) || 0,
      }));
    } catch (error) {
      this.logger.error(
        `Error getting trend data for ${kpi}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
