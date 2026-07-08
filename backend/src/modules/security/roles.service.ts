import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '../../entities/role.entity';
import { Permission } from '../../entities/permission.entity';
import { UserRoleAssignment } from '../../entities/user-role.entity';
import { User } from '../../entities/user.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissions: Repository<Permission>,
    @InjectRepository(UserRoleAssignment)
    private readonly userRoles: Repository<UserRoleAssignment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly ctx: TenantContext,
  ) {}

  private tenantId(): string {
    return this.ctx.tenantId;
  }

  async listRoles(): Promise<Role[]> {
    return this.roles.find({
      where: { tenantId: this.tenantId() },
      relations: ['permissions'],
      order: { createdAt: 'ASC' },
    });
  }

  async getRoleByKey(key: string): Promise<Role> {
    const role = await this.roles.findOne({
      where: { tenantId: this.tenantId(), key },
      relations: ['permissions'],
    });
    if (!role)
      throw new NotFoundException(`Rol '${key}' no existe en el tenant`);
    return role;
  }

  async createRole(dto: {
    key: string;
    name: string;
    description?: string;
    permissions: string[];
  }): Promise<Role> {
    const existing = await this.roles.findOne({
      where: { tenantId: this.tenantId(), key: dto.key },
    });
    if (existing) throw new ConflictException(`Rol '${dto.key}' ya existe`);
    const perms = await this.resolveTenantPermissions(dto.permissions);
    const role = this.roles.create({
      tenantId: this.tenantId(),
      key: dto.key,
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
      isActive: true,
      permissions: perms,
    });
    return this.roles.save(role);
  }

  async updateRole(
    key: string,
    dto: {
      name?: string;
      description?: string;
      isActive?: boolean;
      permissions?: string[];
    },
  ): Promise<Role> {
    const role = await this.getRoleByKey(key);
    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.isActive !== undefined) role.isActive = dto.isActive;
    if (dto.permissions) {
      role.permissions = await this.resolveTenantPermissions(dto.permissions);
    }
    return this.roles.save(role);
  }

  async deleteRole(key: string): Promise<void> {
    const role = await this.getRoleByKey(key);
    if (role.isSystem) {
      throw new ForbiddenException(
        `El rol '${key}' es del sistema y no puede eliminarse. Puede desactivarlo.`,
      );
    }
    await this.roles.delete({ id: role.id, tenantId: this.tenantId() });
  }

  async listAssignableUsers(): Promise<User[]> {
    return this.users.find({
      where: { tenantId: this.tenantId(), isSuperAdmin: false },
      order: { createdAt: 'ASC' },
    });
  }

  async assignRole(
    dto: { userId: string; roleKey: string },
    actorUserId: string,
  ): Promise<UserRoleAssignment> {
    const role = await this.getRoleByKey(dto.roleKey);
    const user = await this.users.findOne({
      where: { id: dto.userId, tenantId: this.tenantId() },
    });
    if (!user)
      throw new NotFoundException(
        `Usuario ${dto.userId} no existe en el tenant`,
      );
    const existing = await this.userRoles.findOne({
      where: { userId: user.id, roleId: role.id },
    });
    if (existing) return existing;
    const assignment = this.userRoles.create({
      tenantId: this.tenantId(),
      userId: user.id,
      roleId: role.id,
      assignedBy: actorUserId,
    });
    return this.userRoles.save(assignment);
  }

  async unassignRole(dto: { userId: string; roleKey: string }): Promise<void> {
    const role = await this.getRoleByKey(dto.roleKey);
    await this.userRoles.delete({
      tenantId: this.tenantId(),
      userId: dto.userId,
      roleId: role.id,
    });
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    const rows = await this.userRoles.find({
      where: { userId, tenantId: this.tenantId() },
      relations: ['role', 'role.permissions'],
    });
    return rows.map((r) => r.role);
  }

  private async resolveTenantPermissions(
    keys: string[],
  ): Promise<Permission[]> {
    if (!Array.isArray(keys) || keys.length === 0) return [];
    const perms = await this.permissions.find({
      where: { key: In(keys), isPlatform: false },
    });
    const foundKeys = new Set(perms.map((p) => p.key));
    const missing = keys.filter((k) => !foundKeys.has(k));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Permisos inválidos o de plataforma (no asignables a rol de tenant): ${missing.join(', ')}`,
      );
    }
    return perms;
  }
}
