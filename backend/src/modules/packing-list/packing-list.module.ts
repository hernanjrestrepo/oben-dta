import { Module } from '@nestjs/common';
import { PackingListController } from './packing-list.controller';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [IntegrationHubModule, AuthModule],
  controllers: [PackingListController],
})
export class PackingListModule {}
