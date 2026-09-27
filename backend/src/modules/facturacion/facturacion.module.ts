import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';
import { DistributionListsModule } from '../distribution-lists/distribution-lists.module';
import { Client } from '../../entities/client.entity';
import { FacturacionController } from './facturacion.controller';
import { FacturacionService } from './facturacion.service';
import { FacturacionPdfService } from './facturacion-pdf.service';

@Module({
  imports: [TypeOrmModule.forFeature([Client]), IntegrationHubModule, AuthModule, DistributionListsModule],
  controllers: [FacturacionController],
  providers: [FacturacionService, FacturacionPdfService],
  exports: [FacturacionService],
})
export class FacturacionModule {}
