import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Tenant } from '../../entities/tenant.entity';
import { ConexionesController } from './conexiones.controller';
import { SharepointDiagnosticoService } from './sharepoint-diagnostico.service';
import { SharepointExcelService } from './sharepoint-excel.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), AuthModule],
  controllers: [ConexionesController],
  providers: [SharepointDiagnosticoService, SharepointExcelService],
  exports: [SharepointExcelService],
})
export class ConexionesModule {}
