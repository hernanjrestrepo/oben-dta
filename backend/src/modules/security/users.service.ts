import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities/user.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { RolesService } from './roles.service';
import {
  CreateTenantUserDto,
  UpdateTenantUserDto,
} from './dto/security.dto';

// Bloqueo manual (distinto del bloqueo temporal por fuerza bruta de
// AuthService): "hasta que un administrador lo desbloquee" se modela como
// una fecha muy lejana en lockedUntil — el mismo campo que ya usa el login.
const MANUAL_LOCK_YEARS = 100;

export interface TenantUserView {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  isLocked: boolean;
  createdAt: Date;
  roles: string[];
}

/**
 * Administración de usuarios DENTRO del tenant (distinto de PlatformUsersService,
 * que administra usuarios de plataforma con tenantId=null). Todo protegido por
 * permisos users.* data-driven — nunca por rol hardcodeado.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly ctx: TenantContext,
    private readonly roles: RolesService,
  ) {}

  private tenantId(): string {
    return this.ctx.tenantId;
  }

  async list(): Promise<TenantUserView[]> {
    const rows = await this.users.find({
      where: { tenantId: this.tenantId(), isSuperAdmin: false },
      order: { createdAt: 'ASC' },
    });
    const out: TenantUserView[] = [];
    for (const u of rows) {
      const userRoles = await this.roles.getUserRoles(u.id);
      out.push(this.toView(u, userRoles.map((r) => r.key)));
    }
    return out;
  }

  async findById(id: string): Promise<TenantUserView> {
    const user = await this.findEntity(id);
    const userRoles = await this.roles.getUserRoles(id);
    return this.toView(user, userRoles.map((r) => r.key));
  }

  async create(
    dto: CreateTenantUserDto,
    actorUserId: string,
  ): Promise<TenantUserView> {
    const tenantId = this.tenantId();
    const existing = await this.users.findOne({
      where: { tenantId, email: dto.email },
    });
    if (existing)
      throw new ConflictException(
        `Ya existe un usuario con el correo '${dto.email}' en este tenant`,
      );
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.users.save(
      this.users.create({
        tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash,
        isActive: true,
        isSuperAdmin: false,
      }),
    );
    for (const roleKey of dto.roleKeys ?? []) {
      await this.roles.assignRole({ userId: user.id, roleKey }, actorUserId);
    }
    return this.findById(user.id);
  }

  async update(id: string, dto: UpdateTenantUserDto): Promise<TenantUserView> {
    const user = await this.findEntity(id);
    if (dto.email !== undefined && dto.email !== user.email) {
      const existing = await this.users.findOne({
        where: { tenantId: this.tenantId(), email: dto.email },
      });
      if (existing)
        throw new ConflictException(
          `Ya existe un usuario con el correo '${dto.email}' en este tenant`,
        );
      user.email = dto.email;
    }
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    await this.users.save(user);
    return this.findById(id);
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    if (id === actorUserId) {
      throw new BadRequestException(
        'No puedes eliminar tu propio usuario mientras tienes la sesión activa',
      );
    }
    const user = await this.findEntity(id);
    await this.users.remove(user);
  }

  async setActive(id: string, isActive: boolean): Promise<TenantUserView> {
    const user = await this.findEntity(id);
    user.isActive = isActive;
    await this.users.save(user);
    return this.findById(id);
  }

  async lock(id: string): Promise<TenantUserView> {
    const user = await this.findEntity(id);
    const until = new Date();
    until.setFullYear(until.getFullYear() + MANUAL_LOCK_YEARS);
    user.lockedUntil = until;
    await this.users.save(user);
    return this.findById(id);
  }

  async unlock(id: string): Promise<TenantUserView> {
    const user = await this.findEntity(id);
    user.lockedUntil = null;
    user.failedLoginAttempts = 0;
    await this.users.save(user);
    return this.findById(id);
  }

  async resetPassword(id: string, password: string): Promise<TenantUserView> {
    const user = await this.findEntity(id);
    user.passwordHash = await bcrypt.hash(password, 12);
    // Invalida cualquier refresh token emitido antes del reset.
    user.tokenVersion += 1;
    await this.users.save(user);
    return this.findById(id);
  }

  private async findEntity(id: string): Promise<User> {
    const user = await this.users.findOne({
      where: { id, tenantId: this.tenantId(), isSuperAdmin: false },
    });
    if (!user)
      throw new NotFoundException(`Usuario ${id} no existe en este tenant`);
    return user;
  }

  private toView(user: User, roles: string[]): TenantUserView {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isActive: user.isActive,
      isLocked: !!user.lockedUntil && user.lockedUntil.getTime() > Date.now(),
      createdAt: user.createdAt,
      roles,
    };
  }
}
