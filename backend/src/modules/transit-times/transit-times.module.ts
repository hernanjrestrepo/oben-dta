import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransitTime } from '../../entities/transit-time.entity';
import { AuthModule } from '../auth/auth.module';
import { TransitTimesService } from './transit-times.service';
import { TransitTimesController } from './transit-times.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TransitTime]), AuthModule],
  controllers: [TransitTimesController],
  providers: [TransitTimesService],
  exports: [TransitTimesService],
})
export class TransitTimesModule {}
