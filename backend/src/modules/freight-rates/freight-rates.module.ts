import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';
import { FreightTransloadRate } from '../../entities/freight-transload-rate.entity';
import { FreightDestinationSurcharge } from '../../entities/freight-destination-surcharge.entity';
import { FreightRateImportService } from './freight-rate-import.service';
import { FreightRatesController } from './freight-rates.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FreightInlandRate,
      FreightTransloadRate,
      FreightDestinationSurcharge,
    ]),
    AuthModule,
  ],
  controllers: [FreightRatesController],
  providers: [FreightRateImportService],
  exports: [FreightRateImportService],
})
export class FreightRatesModule {}
