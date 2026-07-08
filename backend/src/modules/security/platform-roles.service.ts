import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformRole } from '../../entities/platform-role.entity';
import { PlatformUserRole } from '../../entities/platform-user-role.entity';
import { User } from '../../entities/user.entity';

@Injectable()
export class PlatformRolesService {
  constructor(
    @InjectRepository(PlatformRole) private readonly roles: Repository<PlatformRole>,
    @InjectRepository(PlatformUserRole) private readonly assignments: Repository<PlatformUserRole>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async list(): Promise<PlatformRole[]> {
    return this.roles.find({ order: { key: 'ASC' } });
  }

  async assign(dto: { userId: string; platformRoleKey: string }, actorUserId: string): Promise<PlatformUserRole> {
    const role = await this.roles.findOne({ where: { key: dto.platformRoleKey } });
    if (!role) throw new NotFoundException(`Platform role '${dto.platformRoleKey}' no existe`);
    const user = await this.users.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException(`Usuario ${dto.userId} no existe`);
    if (user.tenantId) {
      throw new BadRequestException(
        'Un usuario con tenant no puede recibir un platform role. Debe ser un usuario de plataforma (tenantId null).',
      );
    }
    const existing = await this.assignments.findOne({
      where: { userId: user.id, platformRoleId: role.id },
    });
    if (existing) return existing;
    // Marcar el usuario como superadmin del contexto de plataforma para el interceptor.
    if (!user.isSuperAdmin) {
      user.isSuperAdmin = true;
      await this.users.save(user);
    }
    return this.assignments.save(
      this.assignments.create({
        userId: user.id,
        platformRoleId: role.id,
        assignedBy: actorUserId,
      }),
    );
  }

  async unassign(dto: { userId: string; platformRoleKey: string }): Promise<void> {
    const role = await this.roles.findOne({ where: { key: dto.platformRoleKey } });
    if (!role) throw new NotFoundException(`Platform role '${dto.platformRoleKey}' no existe`);
    await this.assignments.delete({ userId: dto.userId, platformRoleId: role.id });
    const remaining = await this.assignments.count({ where: { userId: dto.userId } });
    if (remaining === 0) {
      const user = await this.users.findOne({ where: { id: dto.userId } });
      if (user && user.isSuperAdmin) {
        user.isSuperAdmin = false;
        await this.users.save(user);
      }
    }
  }

  async listUserRoles(userId: string): Promise<PlatformRole[]> {
    const rows = await this.assignments.find({
      where: { userId },
      relations: ['platformRole', 'platformRole.permissions'],
    });
    return rows.map((r) => r.platformRole);
  }
}
