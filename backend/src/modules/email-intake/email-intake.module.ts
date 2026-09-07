import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../entities/tenant.entity';
import { Client } from '../../entities/client.entity';
import { EmailIntakeMessage } from '../../entities/email-intake-message.entity';
import { ImapConnectorService } from './imap-connector.service';
import { ClassificationModule } from '../classification/classification.module';
import { FreightRatesModule } from '../freight-rates/freight-rates.module';
import { PackingListModule } from '../packing-list/packing-list.module';

/**
 * Adaptador de entrada de correo real (IMAP) — WO-018 Sprint 6. Deliberadamente
 * NO importa QuotesModule/PurchaseOrdersModule: ImapConnectorService resuelve
 * esos servicios en tiempo de ejecución vía ModuleRef (son request-scoped por
 * depender de TenantContext), evitando acoplar este módulo de infraestructura
 * de intake al resto del árbol de módulos de negocio. FreightRatesModule sí
 * se importa directo porque su servicio no depende de TenantContext.
 * PackingListModule se importa igual (PackingListAutomationService también
 * termina siendo request-scoped por TenantContext, así que se resuelve vía
 * ModuleRef como los demás, pero el módulo se importa directo para que Nest
 * pueda resolver el árbol de providers).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, Client, EmailIntakeMessage]),
    ClassificationModule,
    FreightRatesModule,
    PackingListModule,
  ],
  providers: [ImapConnectorService],
  exports: [ImapConnectorService],
})
export class EmailIntakeModule {}
