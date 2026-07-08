import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatasetGeneratorService } from './dataset-generator.service';
import { DatasetController } from './dataset.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_SECRET') ||
          'default-jwt-secret-change-in-production',
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [DatasetController],
  providers: [DatasetGeneratorService, JwtAuthGuard],
  exports: [DatasetGeneratorService],
})
export class DatasetModule {}
