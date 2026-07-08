import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditValidation } from '../../entities/credit-validation.entity';
import { Order } from '../../entities/order.entity';
import { ClientsModule } from '../clients/clients.module';
import { ProductsModule } from '../products/products.module';
import { OrdersModule } from '../orders/orders.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AuthModule } from '../auth/auth.module';
import { OllamaService } from './ollama.service';
import { EvaToolsService } from './tools/eva-tools.service';
import { EvaOrchestratorService } from './eva-orchestrator.service';
import { EvaController } from './eva.controller';

/**
 * EvaModule — capa de IA de EVA.
 * Reúne el cliente LLM (OllamaService) y el Tool Layer real (EvaToolsService)
 * que golpea Clients/Products/Orders/Invoices reales + persistencia de
 * validaciones de crédito.
 *
 * El orquestador LLM (chat + tool calling) se conectará aquí en Fase 3,
 * una vez el benchmark determine el modelo ganador.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CreditValidation, Order]),
    ClientsModule,
    ProductsModule,
    OrdersModule,
    InvoicesModule,
    IntegrationsModule,
    AuthModule,
  ],
  controllers: [EvaController],
  providers: [OllamaService, EvaToolsService, EvaOrchestratorService],
  exports: [OllamaService, EvaToolsService, EvaOrchestratorService],
})
export class EvaModule {}
