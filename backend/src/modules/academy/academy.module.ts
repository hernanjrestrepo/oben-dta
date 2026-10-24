import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademyEvento, AcademyIntento, AcademyProgreso } from '../../entities/academy.entities';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { AcademyController } from './academy.controller';
import { AcademyService } from './academy.service';
import { AcademyPrecalentarTraducciones } from './academy-traduccion';

/** Xmart Academy: entrenamiento por perfil, quizzes que habilitan lo transaccional y panel de fricciones. */
@Module({
  imports: [TypeOrmModule.forFeature([AcademyProgreso, AcademyIntento, AcademyEvento, Tenant, User]), AuthModule],
  controllers: [AcademyController],
  providers: [AcademyService, AcademyPrecalentarTraducciones],
  exports: [AcademyService],
})
export class AcademyModule {}
