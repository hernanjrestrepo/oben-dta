import { Global, Module } from '@nestjs/common';
import { MicrosoftAppTokenService } from './microsoft-app-token.service';

@Global()
@Module({
  providers: [MicrosoftAppTokenService],
  exports: [MicrosoftAppTokenService],
})
export class MicrosoftOAuthModule {}
