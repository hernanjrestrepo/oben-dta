import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from '../services/dashboard.service';
import { DashboardController } from '../controllers/dashboard.controller';
import { AuthModule } from './auth/auth.module';
import { Order } from '../entities/order.entity';
import { Product } from '../entities/product.entity';
import { Client } from '../entities/client.entity';
import { Invoice } from '../entities/invoice.entity';
import { ProductionOrder } from '../entities/production-order.entity';
import { Shipment } from '../entities/shipment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      Product,
      Client,
      Invoice,
      ProductionOrder,
      Shipment,
    ]),
    AuthModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
  exports: [DashboardService],
})
export class DashboardModule {}
