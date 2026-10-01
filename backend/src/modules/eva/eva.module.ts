import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Product } from '../../entities/product.entity';
import { Quote } from '../../entities/quote.entity';
import { Client } from '../../entities/client.entity';
import { Invoice } from '../../entities/invoice.entity';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';
import { FreightDestinationSurcharge } from '../../entities/freight-destination-surcharge.entity';
import { EvaController } from './eva.controller';
import { EvaService, MIA_ANTHROPIC } from './eva.service';
import { QuotesModule } from '../quotes/quotes.module';
import { AuthModule } from '../auth/auth.module';
import { FacturacionModule } from '../facturacion/facturacion.module';
import { LiquidacionModule } from '../liquidacion/liquidacion.module';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Quote,
      Client,
      Invoice,
      FreightInlandRate,
      FreightDestinationSurcharge,
    ]),
    QuotesModule,
    AuthModule,
    FacturacionModule,
    LiquidacionModule,
    IntegrationHubModule,
  ],
  controllers: [EvaController],
  providers: [
    EvaService,
    {
      // Sin ANTHROPIC_API_KEY MIA responde que no está configurada (nunca se cae el backend).
      provide: MIA_ANTHROPIC,
      useFactory: () =>
        process.env.ANTHROPIC_API_KEY
          ? new Anthropic({
              apiKey: process.env.ANTHROPIC_API_KEY,
              timeout: 60_000,
              maxRetries: 2,
            })
          : null,
    },
  ],
})
export class EvaModule {}
