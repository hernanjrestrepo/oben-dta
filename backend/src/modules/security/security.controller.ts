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
import { RolesService } from './roles.service';
import { PermissionsService } from './permissions.service';
import { AuthorizationService } from './authorization.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import {
  AssignUserRoleDto,
  CreateRoleDto,
  UnassignUserRoleDto,
  UpdateRoleDto,
} from './dto/security.dto';

/**
 * Endpoints de administración de seguridad DENTRO del tenant.
 * Cada tenant administra sus propios roles, agrupa permisos y asigna a sus usuarios.
 * Todo protegido por permisos data-driven — nunca por rol hardcodeado.
 */
@Controller('security')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SecurityController {
  constructor(
    private readonly roles: RolesService,
    private readonly perms: PermissionsService,
    private readonly authz: AuthorizationService,
    private readonly ctx: TenantContext,
  ) {}

  @Get('modules')
  @RequirePermission('security.read')
  listModules() {
    return this.perms.listModules();
  }

  @Get('permissions')
  @RequirePermission('security.read')
  listPermissions() {
    return this.perms.listAllTenantPermissions();
  }

  @Get('permissions/by-module/:moduleKey')
  @RequirePermission('security.read')
  listByModule(@Param('moduleKey') moduleKey: string) {
    return this.perms.listPermissionsByModule(moduleKey);
  }

  @Get('roles')
  @RequirePermission('security.read')
  listRoles() {
    return this.roles.listRoles();
  }

  @Get('roles/:key')
  @RequirePermission('security.read')
  getRole(@Param('key') key: string) {
    return this.roles.getRoleByKey(key);
  }

  @Post('roles')
  @RequirePermission('security.create')
  createRole(@Body() dto: CreateRoleDto) {
    return this.roles.createRole(dto);
  }

  @Put('roles/:key')
  @RequirePermission('security.update')
  updateRole(@Param('key') key: string, @Body() dto: UpdateRoleDto) {
    return this.roles.updateRole(key, dto);
  }

  @Delete('roles/:key')
  @RequirePermission('security.delete')
  deleteRole(@Param('key') key: string) {
    return this.roles.deleteRole(key);
  }

  @Get('users')
  @RequirePermission('users.read')
  listUsers() {
    return this.roles.listAssignableUsers();
  }

  @Get('users/:userId/roles')
  @RequirePermission('users.read')
  userRoles(@Param('userId') userId: string) {
    return this.roles.getUserRoles(userId);
  }

  @Post('users/roles')
  @RequirePermission('users.update')
  assignRole(@Body() dto: AssignUserRoleDto, @Req() req: { user: { sub: string } }) {
    return this.roles.assignRole(dto, req.user.sub);
  }

  @Delete('users/roles')
  @RequirePermission('users.update')
  unassignRole(@Body() dto: UnassignUserRoleDto) {
    return this.roles.unassignRole(dto);
  }

  @Get('me/permissions')
  async myPermissions(@Req() req: { user: { sub: string; isSuperAdmin: boolean } }) {
    const perms = await this.authz.listPermissions({
      userId: req.user.sub,
      tenantId: this.ctx.tenantIdOrNull,
      isSuperAdmin: req.user.isSuperAdmin,
    });
    return { permissions: perms };
  }
}
