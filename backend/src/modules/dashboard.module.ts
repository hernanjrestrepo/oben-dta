import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from '../services/dashboard.service';
import { DashboardController } from '../controllers/dashboard.controller';
import { TestController } from '../controllers/test.controller';
import { AuthModule } from './auth/auth.module';
import { ProductionOrder } from '../entities/production-order.entity';
import { Order } from '../entities/order.entity';
import { CreditValidation } from '../entities/credit-validation.entity';
import { Shipment } from '../entities/shipment.entity';
import { ExportOperation } from '../entities/export-operation.entity';
import { Product } from '../entities/product.entity';
import { Client } from '../entities/client.entity';
import { AuditEvent } from '../entities/audit-event.entity';
import { MaterialConsumption } from '../entities/material-consumption.entity';
import { RawMaterialConsumption } from '../entities/raw-material-consumption.entity';
import { PackagingConsumption } from '../entities/packaging-consumption.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionOrder,
      Order,
      CreditValidation,
      Shipment,
      ExportOperation,
      Product,
      Client,
      AuditEvent,
      MaterialConsumption,
      RawMaterialConsumption,
      PackagingConsumption,
    ]),
    AuthModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController, TestController],
  exports: [DashboardService],
})
export class DashboardModule {
  private readonly logger = new Logger(DashboardModule.name);

  constructor() {
    this.logger.log('DashboardModule initialized');
  }
}
