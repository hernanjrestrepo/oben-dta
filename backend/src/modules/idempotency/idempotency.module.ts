import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyRecord } from '../../entities/idempotency-record.entity';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/**
 * Idempotencia transversal (WO-018 Sprint 4). No es `@Global()` a propósito
 * (a diferencia de `IntegrationHubModule`/`SecurityModule`): cada módulo que
 * quiera usar `@Idempotent(...)` importa esto explícitamente — mantiene
 * visible qué controladores dependen de idempotencia en vez de esconderlo.
 */
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord])],
  providers: [IdempotencyService, IdempotencyInterceptor],
  exports: [IdempotencyService, IdempotencyInterceptor],
})
export class IdempotencyModule {}
