import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Tenant } from '../../entities/tenant.entity';
import { ConexionesController } from './conexiones.controller';
import { SharepointDiagnosticoService } from './sharepoint-diagnostico.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), AuthModule],
  controllers: [ConexionesController],
  providers: [SharepointDiagnosticoService],
})
export class ConexionesModule {}
