import { Logger, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CuadroIntegracionController } from './cuadro-integracion.controller';
import { CuadroIntegracionService } from './cuadro-integracion.service';
import { CuadroIntegracionFuenteSimulada } from './cuadro-integracion.simulada';
import { CUADRO_INTEGRACION_FUENTE } from './cuadro-integracion.types';

@Module({
  imports: [AuthModule],
  controllers: [CuadroIntegracionController],
  providers: [
    CuadroIntegracionService,
    {
      // Hasta que Oben entregue las APIs de consumo por orden y los maestros (WO-033) la única fuente es la simulada.
      provide: CUADRO_INTEGRACION_FUENTE,
      useFactory: () => {
        new Logger('CuadroIntegracionModule').warn('Cuadro de integración con datos SIMULADOS (certificado 51590): falta la API de Oben.');
        return new CuadroIntegracionFuenteSimulada();
      },
    },
  ],
  exports: [CuadroIntegracionService],
})
export class CuadroIntegracionModule {}
