import { Module } from '@nestjs/common';
import { PackingListController } from './packing-list.controller';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';
import { DistributionListsModule } from '../distribution-lists/distribution-lists.module';
import { ObenReportsModule } from '../oben-reports/oben-reports.module';

@Module({
  imports: [IntegrationHubModule, AuthModule, DistributionListsModule, ObenReportsModule],
  controllers: [PackingListController],
})
export class PackingListModule {}
