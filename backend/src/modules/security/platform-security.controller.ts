import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermission } from './require-permission.decorator';
import { PermissionsService } from './permissions.service';
import { PlansService } from './plans.service';
import { PlatformRolesService } from './platform-roles.service';
import { LicenseService } from './license.service';
import { LicensingService } from './licensing.service';
import {
  AssignSubscriptionDto,
  CreatePlanDto,
  CreatePlatformUserRoleDto,
  IssueLicenseDto,
  RenewLicenseDto,
  SetFeatureFlagDto,
  UpdatePlanModulesDto,
} from './dto/security.dto';

/**
 * Endpoints de administración de PLATAFORMA (Paradixe). Solo accesibles con
 * platform roles (Nivel 1). Todos los guards y decorators son data-driven.
 */
@Controller('platform')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlatformSecurityController {
  constructor(
    private readonly perms: PermissionsService,
    private readonly plans: PlansService,
    private readonly platformRoles: PlatformRolesService,
    private readonly licenses: LicenseService,
    private readonly licensing: LicensingService,
  ) {}

  // Catálogos globales
  @Get('permissions')
  @RequirePermission('platform.permissions.manage')
  listAllPermissions() {
    return this.perms.listAllTenantPermissions();
  }

  @Get('permissions/platform')
  @RequirePermission('platform.permissions.manage')
  listPlatformPermissions() {
    return this.perms.listAllPlatformPermissions();
  }

  @Get('modules')
  @RequirePermission('platform.modules.manage')
  listModules() {
    return this.perms.listModules();
  }

  // Planes
  @Get('plans')
  @RequirePermission('platform.plans.manage')
  listPlans() {
    return this.plans.list();
  }

  @Get('plans/:key')
  @RequirePermission('platform.plans.manage')
  getPlan(@Param('key') key: string) {
    return this.plans.getByKey(key);
  }

  @Post('plans')
  @RequirePermission('platform.plans.manage')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Put('plans/:key/modules')
  @RequirePermission('platform.plans.manage')
  updatePlanModules(@Param('key') key: string, @Body() dto: UpdatePlanModulesDto) {
    return this.plans.updateModules(key, dto.modules);
  }

  // Suscripciones y feature flags de un tenant
  @Get('tenants/:tenantId/subscription')
  @RequirePermission('platform.subscriptions.manage')
  getSubscription(@Param('tenantId') tenantId: string) {
    return this.plans.getTenantSubscription(tenantId);
  }

  @Put('tenants/:tenantId/subscription')
  @RequirePermission('platform.subscriptions.manage')
  assignSubscription(@Param('tenantId') tenantId: string, @Body() dto: AssignSubscriptionDto) {
    return this.plans.assignSubscription(tenantId, dto);
  }

  @Get('tenants/:tenantId/feature-flags')
  @RequirePermission('platform.feature_flags.manage')
  listFeatureFlags(@Param('tenantId') tenantId: string) {
    return this.plans.listFeatureFlags(tenantId);
  }

  @Put('tenants/:tenantId/feature-flags')
  @RequirePermission('platform.feature_flags.manage')
  setFeatureFlag(
    @Param('tenantId') tenantId: string,
    @Body() dto: SetFeatureFlagDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.plans.setFeatureFlag(tenantId, dto, req.user.sub);
  }

  @Get('tenants/:tenantId/license')
  @RequirePermission('platform.subscriptions.manage')
  async resolveLicense(@Param('tenantId') tenantId: string) {
    const res = await this.licenses.resolve(tenantId);
    const commercial = await this.licensing.validate(tenantId);
    return {
      tenantId: res.tenantId,
      planKey: res.planKey,
      subscriptionStatus: res.subscriptionStatus,
      modulesEnabled: [...res.modulesEnabled],
      planModules: [...res.planModules],
      flagOverrides: res.flagOverrides,
      commercialLicense: commercial.license
        ? {
            id: commercial.license.id,
            installationId: commercial.license.installationId,
            status: commercial.license.status,
            issuedAt: commercial.license.issuedAt,
            expiresAt: commercial.license.expiresAt,
            gracePeriodDays: commercial.license.gracePeriodDays,
            maxUsers: commercial.license.maxUsers,
            maxSites: commercial.license.maxSites,
            offline: commercial.license.offline,
          }
        : null,
      valid: commercial.valid,
      reason: commercial.reason ?? null,
      graceActive: commercial.graceActive ?? false,
      daysRemaining: commercial.daysRemaining ?? null,
      renewalDue: commercial.renewalDue ?? false,
    };
  }

  @Post('tenants/:tenantId/license')
  @RequirePermission('platform.subscriptions.manage')
  issueLicense(@Param('tenantId') tenantId: string, @Body() dto: IssueLicenseDto) {
    return this.licensing.issue(tenantId, dto);
  }

  @Put('tenants/:tenantId/license/renew')
  @RequirePermission('platform.subscriptions.manage')
  renewLicense(@Param('tenantId') tenantId: string, @Body() dto: RenewLicenseDto) {
    return this.licensing.renew(tenantId, dto);
  }

  // Platform roles
  @Get('platform-roles')
  @RequirePermission('platform.tenants.read')
  listPlatformRoles() {
    return this.platformRoles.list();
  }

  @Post('platform-roles/assign')
  @RequirePermission('platform.tenants.manage')
  assignPlatformRole(@Body() dto: CreatePlatformUserRoleDto, @Req() req: { user: { sub: string } }) {
    return this.platformRoles.assign(dto, req.user.sub);
  }

  @Delete('platform-roles/assign')
  @RequirePermission('platform.tenants.manage')
  unassignPlatformRole(@Body() dto: CreatePlatformUserRoleDto) {
    return this.platformRoles.unassign(dto);
  }
}
