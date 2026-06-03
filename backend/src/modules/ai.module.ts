import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIService } from '../services/ai.service';
import { AIController } from '../controllers/ai.controller';
import { ProductionOrder } from '../entities/production-order.entity';
import { Order } from '../entities/order.entity';
import { Client } from '../entities/client.entity';
import { Product } from '../entities/product.entity';
import { Shipment } from '../entities/shipment.entity';
import { ExportOperation } from '../entities/export-operation.entity';
import { CreditValidation } from '../entities/credit-validation.entity';
import { AuditEvent } from '../entities/audit-event.entity';
import { MaterialConsumption } from '../entities/material-consumption.entity';
import { RawMaterialConsumption } from '../entities/raw-material-consumption.entity';
import { PackagingConsumption } from '../entities/packaging-consumption.entity';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionOrder,
      Order,
      Client,
      Product,
      Shipment,
      ExportOperation,
      CreditValidation,
      AuditEvent,
      MaterialConsumption,
      RawMaterialConsumption,
      PackagingConsumption,
    ]),
    AuthModule,
  ],
  providers: [AIService],
  controllers: [AIController],
  exports: [AIService],
})
export class AIModule {}
