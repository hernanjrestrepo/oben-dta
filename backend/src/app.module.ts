import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './controllers/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { EvaModule } from './modules/ia/eva.module';
import { AdanModule } from './modules/adan/adan.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { SeedModule } from './modules/seed/seed.module';
import { DashboardModule } from './modules/dashboard.module';
import { TenantModule } from './common/tenant/tenant.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { SecurityModule } from './modules/security/security.module';
import { IntegrationHubModule } from './modules/integrations/hub/integration-hub.module';
import { DatasetModule } from './modules/dataset/dataset.module';

// Import all entities
import { AuditEvent } from './entities/audit-event.entity';
import { Client } from './entities/client.entity';
import { Tenant } from './entities/tenant.entity';
import { ModuleCatalog } from './entities/module-catalog.entity';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { UserRoleAssignment } from './entities/user-role.entity';
import { PlatformRole } from './entities/platform-role.entity';
import { PlatformUserRole } from './entities/platform-user-role.entity';
import { Plan } from './entities/plan.entity';
import { PlanModule as PlanModuleEntity } from './entities/plan-module.entity';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import { TenantFeatureFlag } from './entities/tenant-feature-flag.entity';
import { MockScenario } from './entities/mock-scenario.entity';
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
    // Rate limiting global: 3 buckets con ventanas escalonadas.
    // Los buckets protegen contra bursts (segundo), abuso corto (minuto) y scraping (hora).
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 60_000, limit: 300 },
      { name: 'long', ttl: 60 * 60 * 1000, limit: 10_000 },
    ]),
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
          Tenant,
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
          // Security Enterprise
          ModuleCatalog,
          Permission,
          Role,
          UserRoleAssignment,
          PlatformRole,
          PlatformUserRole,
          Plan,
          PlanModuleEntity,
          TenantSubscription,
          TenantFeatureFlag,
          MockScenario,
        ],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    TenantModule,
    SecurityModule,
    IntegrationHubModule,
    DatasetModule,
    TenantsModule,
    AuthModule,
    ClientsModule,
    ProductsModule,
    OrdersModule,
    InvoicesModule,
    EvaModule,
    AdanModule,
    IntegrationsModule,
    QuotesModule,
    SeedModule,
    DashboardModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
