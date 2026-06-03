import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './controllers/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { FlowModule } from './modules/flow/flow.module';
import { MockModule } from './modules/mock/mock.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { SeedModule } from './modules/seed/seed.module';
import { DashboardModule } from './modules/dashboard.module';

// Import all entities
import { AuditEvent } from './entities/audit-event.entity';
import { Client } from './entities/client.entity';
import { CreditValidation } from './entities/credit-validation.entity';
import { ExportCostSheet } from './entities/export-cost-sheet.entity';
import { ExportOperation } from './entities/export-operation.entity';
import { FreightQuote } from './entities/freight-quote.entity';
import { Incoterm } from './entities/incoterm.entity';
import { InsuranceQuote } from './entities/insurance-quote.entity';
import { Invoice } from './entities/invoice.entity';
import { MasterPackingList } from './entities/master-packing-list.entity';
import { MaterialConsumption } from './entities/material-consumption.entity';
import { Notification } from './entities/notification.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { PackagingConsumption } from './entities/packaging-consumption.entity';
import { PackingList } from './entities/packing-list.entity';
import { ProductionOrder } from './entities/production-order.entity';
import { Product } from './entities/product.entity';
import { Quote } from './entities/quote.entity';
import { QuoteItem } from './entities/quote-item.entity';
import { RawMaterialConsumption } from './entities/raw-material-consumption.entity';
import { Shipment } from './entities/shipment.entity';
import { ShipmentTracking } from './entities/shipment-tracking.entity';
import { User } from './entities/user.entity';
import { WorkflowEvent } from './entities/workflow-event.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'dta'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME', 'dta_db'),
        entities: [
          AuditEvent,
          Client,
          CreditValidation,
          ExportCostSheet,
          ExportOperation,
          FreightQuote,
          Incoterm,
          InsuranceQuote,
          Invoice,
          MasterPackingList,
          MaterialConsumption,
          Notification,
          Order,
          OrderItem,
          PackagingConsumption,
          PackingList,
          ProductionOrder,
          Product,
          Quote,
          QuoteItem,
          RawMaterialConsumption,
          Shipment,
          ShipmentTracking,
          User,
          WorkflowEvent,
        ],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    ClientsModule,
    ProductsModule,
    OrdersModule,
    FlowModule,
    MockModule,
    QuotesModule,
    SeedModule,
    DashboardModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
