import { Module } from '@nestjs/common';
import { MockController } from './mock.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MockController],
})
export class MockModule {}
