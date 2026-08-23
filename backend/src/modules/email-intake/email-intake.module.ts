import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../entities/tenant.entity';
import { Client } from '../../entities/client.entity';
import { EmailIntakeMessage } from '../../entities/email-intake-message.entity';
import { ImapConnectorService } from './imap-connector.service';
import { ClassificationModule } from '../classification/classification.module';

/**
 * Adaptador de entrada de correo real (IMAP) — WO-018 Sprint 6. Deliberadamente
 * NO importa QuotesModule/PurchaseOrdersModule: ImapConnectorService resuelve
 * esos servicios en tiempo de ejecución vía ModuleRef (son request-scoped por
 * depender de TenantContext), evitando acoplar este módulo de infraestructura
 * de intake al resto del árbol de módulos de negocio.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, Client, EmailIntakeMessage]),
    ClassificationModule,
  ],
  providers: [ImapConnectorService],
  exports: [ImapConnectorService],
})
export class EmailIntakeModule {}
