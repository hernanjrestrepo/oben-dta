import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Tenant } from '../../entities/tenant.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'default-jwt-secret-change-in-production',
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [TenantsController],
  providers: [TenantsService, JwtAuthGuard],
  exports: [TenantsService],
})
export class TenantsModule implements OnModuleInit {
  constructor(private readonly tenants: TenantsService) {}

  async onModuleInit(): Promise<void> {
    // Bootstrap idempotente del tenant inicial "oben".
    // No hace nada si ya existe. Es la única llamada auto-ejecutada del módulo.
    await this.tenants.ensureBootstrapTenant();
  }
}
