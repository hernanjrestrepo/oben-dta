import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DistributionListsModule } from '../distribution-lists/distribution-lists.module';
import { ObenReportsModule } from '../oben-reports/oben-reports.module';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { FormatosModule } from '../formatos/formatos.module';
import { EnvioManualService } from './envio-manual.service';
import { EnvioManualController } from './envio-manual.controller';

@Module({
  imports: [AuthModule, DistributionListsModule, ObenReportsModule, IntegrationHubModule, FormatosModule],
  controllers: [EnvioManualController],
  providers: [EnvioManualService],
})
export class EnvioManualModule {}
