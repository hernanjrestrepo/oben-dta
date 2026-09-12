import { Module } from '@nestjs/common';
import { ObenReportsController } from './oben-reports.controller';
import { ObenReportExcelService } from './oben-report-excel.service';
import { SolefilmesPdfService } from './solefilmes-pdf.service';
import { ObenReportsService } from './oben-reports.service';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';
import { DistributionListsModule } from '../distribution-lists/distribution-lists.module';
import { FreightRatesModule } from '../freight-rates/freight-rates.module';

@Module({
  imports: [IntegrationHubModule, AuthModule, DistributionListsModule, FreightRatesModule],
  controllers: [ObenReportsController],
  providers: [ObenReportExcelService, SolefilmesPdfService, ObenReportsService],
  exports: [ObenReportExcelService, SolefilmesPdfService, ObenReportsService],
})
export class ObenReportsModule {}
