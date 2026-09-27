import { Module } from '@nestjs/common';
import { IntegrationHubModule } from '../integrations/hub/integration-hub.module';
import { AuthModule } from '../auth/auth.module';
import { ComercialController } from './comercial.controller';
import { ComercialService } from './comercial.service';

@Module({
  imports: [IntegrationHubModule, AuthModule],
  controllers: [ComercialController],
  providers: [ComercialService],
  exports: [ComercialService],
})
export class ComercialModule {}
