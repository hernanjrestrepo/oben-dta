import { Logger, Module } from '@nestjs/common';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';
import { FreightRatesModule } from '../freight-rates/freight-rates.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { LiquidacionController } from './liquidacion.controller';
import { LiquidacionService } from './liquidacion.service';
import { LIQUIDACION_SIMULATION_ENV, LIQUIDACION_VALUE_CALCULATOR, calculatorFromEnv } from './liquidacion-value-calculator';

@Module({
  imports: [IntegrationHubModule, AuthModule, FreightRatesModule, IdempotencyModule],
  controllers: [LiquidacionController],
  providers: [
    LiquidacionService,
    {
      // Producción (variable ausente): PendingFormulaCalculator — nada se
      // calcula hasta que José entregue la fórmula. Dev/demo:
      // LIQUIDACION_SIMULATION_MODE=true → fórmula SIMULADA, que el servicio
      // nunca deja llegar a un envío real (ver LiquidacionService.submit).
      provide: LIQUIDACION_VALUE_CALCULATOR,
      useFactory: () => {
        const calculator = calculatorFromEnv();
        if (calculator.simulated) {
          new Logger('LiquidacionModule').warn(
            `${LIQUIDACION_SIMULATION_ENV}=true: Liquidación usa la fórmula de Incoterm SIMULADA — solo simulación; los envíos reales a Oben quedan bloqueados.`,
          );
        }
        return calculator;
      },
    },
  ],
  exports: [LiquidacionService],
})
export class LiquidacionModule {}
