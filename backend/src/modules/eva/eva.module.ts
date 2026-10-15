import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../entities/product.entity';
import { Quote } from '../../entities/quote.entity';
import { Client } from '../../entities/client.entity';
import { Invoice } from '../../entities/invoice.entity';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';
import { FreightDestinationSurcharge } from '../../entities/freight-destination-surcharge.entity';
import { FreightOceanRate } from '../../entities/freight-ocean-rate.entity';
import { EvaController } from './eva.controller';
import { EvaService } from './eva.service';
import { MIA_LLM, crearMiaLlm } from './mia-llm';
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
      FreightOceanRate,
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
      // Kimi primero y Ollama de respaldo; sin ninguna clave MIA responde que no está configurada (nunca se cae el backend).
      provide: MIA_LLM,
      useFactory: () =>
        crearMiaLlm(process.env, (err) => new Logger('MIA').warn(`Modelo falló, se intenta el siguiente: ${(err as Error).message}`)),
    },
  ],
})
export class EvaModule {}
