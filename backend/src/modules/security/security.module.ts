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
import { Tenant } from '../../entities/tenant.entity';
import { License } from '../../entities/license.entity';
import { WorkflowEvent } from '../../entities/workflow-event.entity';
import { AuthorizationService } from './authorization.service';
import { WorkflowAuditService } from './workflow-audit.service';
import { AuditController } from './audit.controller';
import { LicenseService } from './license.service';
import { LicenseSigningService } from './license-signing.service';
import { LicensingService } from './licensing.service';
import { InstallationFingerprintService } from './installation-fingerprint.service';
import { SecurityBootstrapService } from './security-bootstrap.service';
import { RolesService } from './roles.service';
import { UsersService } from './users.service';
import { PermissionsService } from './permissions.service';
import { PlansService } from './plans.service';
import { PlatformRolesService } from './platform-roles.service';
import { PlatformUsersService } from './platform-users.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformSystemStatusService } from './platform-system-status.service';
import { PermissionsGuard } from './permissions.guard';
import { SecurityController } from './security.controller';
import { UsersController } from './users.controller';
import { PlatformSecurityController } from './platform-security.controller';
import { PlatformUsersController } from './platform-users.controller';
import { PlatformAuditController } from './platform-audit.controller';
import { PlatformSystemController } from './platform-system.controller';
import { LicenseController } from './license.controller';
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
      Tenant,
      License,
      WorkflowEvent,
    ]),
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
  providers: [
    AuthorizationService,
    LicenseService,
    LicenseSigningService,
    LicensingService,
    InstallationFingerprintService,
    SecurityBootstrapService,
    RolesService,
    UsersService,
    PermissionsService,
    PlansService,
    PlatformRolesService,
    PlatformUsersService,
    PlatformAuditService,
    PlatformSystemStatusService,
    WorkflowAuditService,
    PermissionsGuard,
    JwtAuthGuard,
  ],
  controllers: [
    SecurityController,
    UsersController,
    PlatformSecurityController,
    PlatformUsersController,
    PlatformAuditController,
    PlatformSystemController,
    LicenseController,
    AuditController,
  ],
  exports: [
    AuthorizationService,
    LicenseService,
    LicensingService,
    SecurityBootstrapService,
    PermissionsGuard,
    RolesService,
    UsersService,
    PermissionsService,
    PlansService,
    PlatformRolesService,
    WorkflowAuditService,
  ],
})
export class SecurityModule {}
