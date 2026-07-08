import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';

/**
 * Módulo fachada legacy. Sus servicios individuales (VETA/NetSuite/Armstrong)
 * fueron reemplazados por el IntegrationHub (adapters intercambiables Real/Mock).
 *
 * Aquí solo queda `IntegrationsService` como capa de compatibilidad para EVA Tools;
 * el controller HTTP legacy fue desmontado — todas las rutas /integrations/*
 * las sirve ahora IntegrationHubController.
 */
@Module({
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
