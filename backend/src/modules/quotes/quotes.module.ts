import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from '../../entities/quote.entity';
import { QuoteItem } from '../../entities/quote-item.entity';
import { Client } from '../../entities/client.entity';
import { Product } from '../../entities/product.entity';
import { Tenant } from '../../entities/tenant.entity';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuotePdfService } from './quote-pdf.service';
import { EmailService } from './email.service';
import { PaymentService } from './payment.service';
import { QuotesDocumentFlowRegistration } from './quotes-document-flow.registration';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { DocumentFlowModule } from '../document-flow/document-flow.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quote, QuoteItem, Client, Product, Tenant]),
    AuthModule,
    OrdersModule,
    InvoicesModule,
    DocumentFlowModule,
    IdempotencyModule,
  ],
  controllers: [QuotesController],
  providers: [
    QuotesService,
    QuotePdfService,
    EmailService,
    PaymentService,
    QuotesDocumentFlowRegistration,
  ],
  exports: [QuotesService],
})
export class QuotesModule {}
