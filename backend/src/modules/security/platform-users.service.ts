import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities/user.entity';
import { PlatformUserRole } from '../../entities/platform-user-role.entity';
import { PlatformRolesService } from './platform-roles.service';
import { CreatePlatformUserDto, UpdatePlatformUserDto } from './dto/security.dto';

export interface PlatformUserView {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: Date;
  platformRoles: string[];
}

/**
 * Administra usuarios de plataforma (tenantId=null). Separado de UsersService
 * (tenant-scoped) porque el modelo de datos, permisos y flujo de login son
 * distintos: estos usuarios nunca pertenecen a un tenant y su único camino de
 * entrada es AuthService.platformLogin().
 */
@Injectable()
export class PlatformUsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PlatformUserRole) private readonly assignments: Repository<PlatformUserRole>,
    private readonly platformRoles: PlatformRolesService,
  ) {}

  async list(): Promise<PlatformUserView[]> {
    const rows = await this.users.find({ where: { tenantId: IsNull() }, order: { createdAt: 'ASC' } });
    const out: PlatformUserView[] = [];
    for (const u of rows) {
      const roles = await this.platformRoles.listUserRoles(u.id);
      out.push(this.toView(u, roles.map((r) => r.key)));
    }
    return out;
  }

  async findById(id: string): Promise<PlatformUserView> {
    const user = await this.users.findOne({ where: { id, tenantId: IsNull() } });
    if (!user) throw new NotFoundException(`Usuario de plataforma ${id} no existe`);
    const roles = await this.platformRoles.listUserRoles(id);
    return this.toView(user, roles.map((r) => r.key));
  }

  async create(dto: CreatePlatformUserDto, actorUserId: string): Promise<PlatformUserView> {
    const existing = await this.users.findOne({ where: { email: dto.email, tenantId: IsNull() } });
    if (existing) throw new ConflictException(`Ya existe un usuario de plataforma con el correo '${dto.email}'`);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.users.save(this.users.create({
      tenantId: null,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      isActive: true,
      isSuperAdmin: false,
    }));
    if (dto.platformRoleKey) {
      await this.platformRoles.assign({ userId: user.id, platformRoleKey: dto.platformRoleKey }, actorUserId);
    }
    return this.findById(user.id);
  }

  async update(id: string, dto: UpdatePlatformUserDto): Promise<PlatformUserView> {
    const user = await this.users.findOne({ where: { id, tenantId: IsNull() } });
    if (!user) throw new NotFoundException(`Usuario de plataforma ${id} no existe`);
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, 12);
    await this.users.save(user);
    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    const user = await this.users.findOne({ where: { id, tenantId: IsNull() } });
    if (!user) throw new NotFoundException(`Usuario de plataforma ${id} no existe`);
    const remainingSuperAdmins = await this.users.count({
      where: { tenantId: IsNull(), isSuperAdmin: true },
    });
    if (user.isSuperAdmin && remainingSuperAdmins <= 1) {
      throw new BadRequestException('No se puede eliminar el último SuperAdmin de plataforma');
    }
    await this.assignments.delete({ userId: id });
    await this.users.remove(user);
  }

  private toView(user: User, platformRoles: string[]): PlatformUserView {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isActive: user.isActive,
      isSuperAdmin: user.isSuperAdmin,
      createdAt: user.createdAt,
      platformRoles,
    };
  }
}
