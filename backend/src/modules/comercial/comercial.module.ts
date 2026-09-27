import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { EquivalencesModule } from '../equivalences/equivalences.module';
import { DistributionListsModule } from '../distribution-lists/distribution-lists.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { ComercialCase } from '../../entities/comercial-case.entity';
import { Tenant } from '../../entities/tenant.entity';
import { Client } from '../../entities/client.entity';
import { ComercialController } from './comercial.controller';
import { ComercialCasosController } from './comercial-casos.controller';
import { ComercialService } from './comercial.service';
import { ComercialIntakeService } from './comercial-intake.service';
import { ComercialFlujoService } from './comercial-flujo.service';
import { ComercialProcessorService } from './comercial-processor.service';
import { ComercialSimuladorService } from './comercial-simulador.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComercialCase, Tenant, Client]),
    IntegrationHubModule,
    AuthModule,
    ClientsModule,
    EquivalencesModule,
    DistributionListsModule,
    IdempotencyModule,
  ],
  controllers: [ComercialController, ComercialCasosController],
  providers: [ComercialService, ComercialIntakeService, ComercialFlujoService, ComercialProcessorService, ComercialSimuladorService],
  exports: [ComercialService, ComercialFlujoService],
})
export class ComercialModule {}
