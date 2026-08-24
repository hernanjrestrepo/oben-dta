import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';
import { FreightTransloadRate } from '../../entities/freight-transload-rate.entity';
import { FreightDestinationSurcharge } from '../../entities/freight-destination-surcharge.entity';
import { FreightRateImportService } from './freight-rate-import.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FreightInlandRate,
      FreightTransloadRate,
      FreightDestinationSurcharge,
    ]),
  ],
  providers: [FreightRateImportService],
  exports: [FreightRateImportService],
})
export class FreightRatesModule {}
