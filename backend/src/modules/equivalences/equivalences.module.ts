import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientProductEquivalence } from '../../entities/client-product-equivalence.entity';
import { Client } from '../../entities/client.entity';
import { EquivalencesService } from './equivalences.service';
import { EquivalencesController } from './equivalences.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([ClientProductEquivalence, Client]), AuthModule],
  controllers: [EquivalencesController],
  providers: [EquivalencesService],
  exports: [EquivalencesService],
})
export class EquivalencesModule {}
