import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComercialCase } from '../../entities/comercial-case.entity';
import { LiquidacionAprobacion } from '../../entities/liquidacion-aprobacion.entity';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';
import { FreightRatesModule } from '../freight-rates/freight-rates.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { DistributionListsModule } from '../distribution-lists/distribution-lists.module';
import { ObenReportsModule } from '../oben-reports/oben-reports.module';
import { LiquidacionCierreService } from './liquidacion-cierre.service';
import { LiquidacionAvisoService } from './liquidacion-aviso.service';
import { LiquidacionController } from './liquidacion.controller';
import { LIQUIDACION_OPCIONES, LiquidacionService } from './liquidacion.service';
import { LIQUIDACION_SIMULATION_ENV, LIQUIDACION_VALUE_CALCULATOR, calculatorFromEnv } from './liquidacion-value-calculator';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComercialCase, LiquidacionAprobacion]),
    IntegrationHubModule,
    AuthModule,
    FreightRatesModule,
    IdempotencyModule,
    DistributionListsModule,
    ObenReportsModule,
  ],
  controllers: [LiquidacionController],
  providers: [
    LiquidacionService,
    {
      // Valores provisionales (partida, HMF, flete en 0) mientras Oben entrega
      // sus tablas: activos salvo LIQUIDACION_VALORES_PROVISIONALES=false.
      provide: LIQUIDACION_OPCIONES,
      // requiereAprobacion: COMEX aprueba antes de enviar (Hernán, 6-oct) — no se desactiva por variable de entorno.
      useFactory: () => ({ valoresProvisionales: process.env.LIQUIDACION_VALORES_PROVISIONALES !== 'false', requiereAprobacion: true }),
    },
    LiquidacionCierreService,
    LiquidacionAvisoService,
    {
      // Producción (variable ausente): IncotermFormulaCalculator — la fórmula
      // de José con los datos que digita el usuario (sus puntos sin confirmar
      // bloquean el envío real). Dev/demo: LIQUIDACION_SIMULATION_MODE=true →
      // misma fórmula con datos del envío de EJEMPLO, que el servicio nunca
      // deja llegar a un envío real (ver LiquidacionService.submit).
      provide: LIQUIDACION_VALUE_CALCULATOR,
      useFactory: () => {
        const calculator = calculatorFromEnv();
        if (calculator.simulated) {
          new Logger('LiquidacionModule').warn(
            `${LIQUIDACION_SIMULATION_ENV}=true: Liquidación usa datos del envío SIMULADOS — solo simulación; los envíos reales a Oben quedan bloqueados.`,
          );
        }
        return calculator;
      },
    },
  ],
  exports: [LiquidacionService, LiquidacionAvisoService],
})
export class LiquidacionModule {}
