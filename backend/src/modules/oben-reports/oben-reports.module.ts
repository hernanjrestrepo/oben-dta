import { Module } from '@nestjs/common';
import { ObenReportsController } from './oben-reports.controller';
import { ObenReportExcelService } from './oben-report-excel.service';
import { SolefilmesPdfService } from './solefilmes-pdf.service';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';
import { DistributionListsModule } from '../distribution-lists/distribution-lists.module';

@Module({
  imports: [IntegrationHubModule, AuthModule, DistributionListsModule],
  controllers: [ObenReportsController],
  providers: [ObenReportExcelService, SolefilmesPdfService],
  exports: [ObenReportExcelService, SolefilmesPdfService],
})
export class ObenReportsModule {}
