import { Module } from '@nestjs/common';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';
import { FreightRatesModule } from '../freight-rates/freight-rates.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { LiquidacionController } from './liquidacion.controller';
import { LiquidacionService } from './liquidacion.service';
import { LIQUIDACION_VALUE_CALCULATOR, PendingFormulaCalculator } from './liquidacion-value-calculator';

@Module({
  imports: [IntegrationHubModule, AuthModule, FreightRatesModule, IdempotencyModule],
  controllers: [LiquidacionController],
  providers: [LiquidacionService, { provide: LIQUIDACION_VALUE_CALCULATOR, useClass: PendingFormulaCalculator }],
  exports: [LiquidacionService],
})
export class LiquidacionModule {}
