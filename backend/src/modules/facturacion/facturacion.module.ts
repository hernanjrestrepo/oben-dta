import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';
import { DistributionListsModule } from '../distribution-lists/distribution-lists.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { Client } from '../../entities/client.entity';
import { Tenant } from '../../entities/tenant.entity';
import { FacturaParcial } from '../../entities/factura-parcial.entity';
import { FacturasParcialesService } from './facturas-parciales.service';
import { FacturasParcialesController } from './facturas-parciales.controller';
import { FacturacionController } from './facturacion.controller';
import { FacturacionService } from './facturacion.service';
import { FacturacionPdfService } from './facturacion-pdf.service';

@Module({
  imports: [TypeOrmModule.forFeature([Client, Tenant, FacturaParcial]), IntegrationHubModule, AuthModule, DistributionListsModule, IdempotencyModule],
  controllers: [FacturacionController, FacturasParcialesController],
  providers: [FacturacionService, FacturacionPdfService, FacturasParcialesService],
  exports: [FacturacionService, FacturasParcialesService],
})
export class FacturacionModule {}
