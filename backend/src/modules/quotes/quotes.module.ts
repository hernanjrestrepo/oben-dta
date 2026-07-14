import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from '../../entities/quote.entity';
import { QuoteItem } from '../../entities/quote-item.entity';
import { Client } from '../../entities/client.entity';
import { Product } from '../../entities/product.entity';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuotePdfService } from './quote-pdf.service';
import { EmailService } from './email.service';
import { PaymentService } from './payment.service';
import { DemoService } from './demo.service';
import { DemoController } from './demo.controller';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quote, QuoteItem, Client, Product]),
    AuthModule,
    OrdersModule,
    InvoicesModule,
  ],
  controllers: [QuotesController, DemoController],
  providers: [
    QuotesService,
    QuotePdfService,
    EmailService,
    PaymentService,
    DemoService,
  ],
  exports: [QuotesService],
})
export class QuotesModule {}
