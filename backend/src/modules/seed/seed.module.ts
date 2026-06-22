import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { Client } from '../../entities/client.entity';
import { Product } from '../../entities/product.entity';
import { User } from '../../entities/user.entity';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Quote } from '../../entities/quote.entity';
import { QuoteItem } from '../../entities/quote-item.entity';
import { ProductionOrder } from '../../entities/production-order.entity';
import { Invoice } from '../../entities/invoice.entity';
import { ExportOperation } from '../../entities/export-operation.entity';
import { Shipment } from '../../entities/shipment.entity';
import { Incoterm } from '../../entities/incoterm.entity';
import { FreightQuote } from '../../entities/freight-quote.entity';
import { InsuranceQuote } from '../../entities/insurance-quote.entity';
import { ExportCostSheet } from '../../entities/export-cost-sheet.entity';
import { PackingList } from '../../entities/packing-list.entity';
import { MasterPackingList } from '../../entities/master-packing-list.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Client,
      Product,
      User,
      Order,
      OrderItem,
      Quote,
      QuoteItem,
      ProductionOrder,
      Invoice,
      ExportOperation,
      Shipment,
      Incoterm,
      FreightQuote,
      InsuranceQuote,
      ExportCostSheet,
      PackingList,
      MasterPackingList,
    ]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
