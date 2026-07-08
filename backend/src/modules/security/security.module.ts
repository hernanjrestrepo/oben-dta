import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModuleCatalog } from '../../entities/module-catalog.entity';
import { Permission } from '../../entities/permission.entity';
import { Role } from '../../entities/role.entity';
import { UserRoleAssignment } from '../../entities/user-role.entity';
import { PlatformRole } from '../../entities/platform-role.entity';
import { PlatformUserRole } from '../../entities/platform-user-role.entity';
import { Plan } from '../../entities/plan.entity';
import { PlanModule } from '../../entities/plan-module.entity';
import { TenantSubscription } from '../../entities/tenant-subscription.entity';
import { TenantFeatureFlag } from '../../entities/tenant-feature-flag.entity';
import { User } from '../../entities/user.entity';
import { AuthorizationService } from './authorization.service';
import { LicenseService } from './license.service';
import { SecurityBootstrapService } from './security-bootstrap.service';
import { RolesService } from './roles.service';
import { PermissionsService } from './permissions.service';
import { PlansService } from './plans.service';
import { PlatformRolesService } from './platform-roles.service';
import { PermissionsGuard } from './permissions.guard';
import { SecurityController } from './security.controller';
import { PlatformSecurityController } from './platform-security.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ModuleCatalog,
      Permission,
      Role,
      UserRoleAssignment,
      PlatformRole,
      PlatformUserRole,
      Plan,
      PlanModule,
      TenantSubscription,
      TenantFeatureFlag,
      User,
    ]),
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
  providers: [
    AuthorizationService,
    LicenseService,
    SecurityBootstrapService,
    RolesService,
    PermissionsService,
    PlansService,
    PlatformRolesService,
    PermissionsGuard,
    JwtAuthGuard,
  ],
  controllers: [SecurityController, PlatformSecurityController],
  exports: [
    AuthorizationService,
    LicenseService,
    SecurityBootstrapService,
    PermissionsGuard,
    RolesService,
    PermissionsService,
    PlansService,
  ],
})
export class SecurityModule {}
