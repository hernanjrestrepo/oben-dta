import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../../entities/client.entity';
import { Product } from '../../entities/product.entity';
import { Quote } from '../../entities/quote.entity';
import { Tenant } from '../../entities/tenant.entity';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { PurchaseOrderDocument } from '../../entities/purchase-order-document.entity';
import { AuthModule } from '../auth/auth.module';
import { DocumentFlowModule } from '../document-flow/document-flow.module';
import { ClassificationModule } from '../classification/classification.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderExtractor } from './purchase-order-extractor';
import { CreateOrderAction } from './actions/create-order.action';
import {
  ClientExistsValidator,
  DomainAuthorizedValidator,
  QuoteExistsValidator,
  QuoteValidValidator,
  CreditLimitValidator,
  ProductsValidValidator,
  QuantitiesCoherentValidator,
} from './purchase-order-validators';
import { PurchaseOrdersDocumentFlowRegistration } from './purchase-orders-document-flow.registration';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Product, Quote, Tenant, Order, OrderItem, PurchaseOrderDocument]),
    AuthModule,
    DocumentFlowModule,
    ClassificationModule,
    IdempotencyModule,
  ],
  controllers: [PurchaseOrdersController],
  providers: [
    PurchaseOrdersService,
    PurchaseOrderExtractor,
    CreateOrderAction,
    ClientExistsValidator,
    DomainAuthorizedValidator,
    QuoteExistsValidator,
    QuoteValidValidator,
    CreditLimitValidator,
    ProductsValidValidator,
    QuantitiesCoherentValidator,
    PurchaseOrdersDocumentFlowRegistration,
  ],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
