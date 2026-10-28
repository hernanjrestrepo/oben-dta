import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IaUso } from '../../entities/ia-uso.entity';
import { Tenant } from '../../entities/tenant.entity';
import { IaModelosService } from './ia-modelos.service';

/** Modo inteligente de modelos de imagen y video (28-oct): selector por nivel, topes de costo y registro del gasto. */
@Module({
  imports: [TypeOrmModule.forFeature([IaUso, Tenant])],
  providers: [IaModelosService],
  exports: [IaModelosService],
})
export class IaModule {}
