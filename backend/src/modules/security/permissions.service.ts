import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../../entities/permission.entity';
import { ModuleCatalog } from '../../entities/module-catalog.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly perms: Repository<Permission>,
    @InjectRepository(ModuleCatalog)
    private readonly modules: Repository<ModuleCatalog>,
  ) {}

  async listAllTenantPermissions(): Promise<Permission[]> {
    return this.perms.find({
      where: { isPlatform: false },
      order: { moduleKey: 'ASC', action: 'ASC' },
    });
  }

  async listAllPlatformPermissions(): Promise<Permission[]> {
    return this.perms.find({
      where: { isPlatform: true },
      order: { moduleKey: 'ASC', action: 'ASC' },
    });
  }

  async listModules(): Promise<ModuleCatalog[]> {
    return this.modules.find({ order: { category: 'ASC', name: 'ASC' } });
  }

  async listPermissionsByModule(moduleKey: string): Promise<Permission[]> {
    return this.perms.find({
      where: { moduleKey, isPlatform: false },
      order: { action: 'ASC' },
    });
  }
}
