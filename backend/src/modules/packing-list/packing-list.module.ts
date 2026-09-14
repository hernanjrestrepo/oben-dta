import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PackingListController } from './packing-list.controller';
import { PackingListAutomationService } from './packing-list-automation.service';
import { PackingListRetryProcessorService } from './packing-list-retry-processor.service';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';
import { DistributionListsModule } from '../distribution-lists/distribution-lists.module';
import { ObenReportsModule } from '../oben-reports/oben-reports.module';
import { PackingListPendingRetry } from '../../entities/packing-list-pending-retry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PackingListPendingRetry]),
    IntegrationHubModule,
    AuthModule,
    DistributionListsModule,
    ObenReportsModule,
  ],
  controllers: [PackingListController],
  providers: [PackingListAutomationService, PackingListRetryProcessorService],
  exports: [PackingListAutomationService],
})
export class PackingListModule {}
