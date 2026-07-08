import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuleCatalog } from '../../entities/module-catalog.entity';
import { Permission } from '../../entities/permission.entity';
import { PlatformRole } from '../../entities/platform-role.entity';
import { Plan } from '../../entities/plan.entity';
import { PlanModule } from '../../entities/plan-module.entity';
import { Role } from '../../entities/role.entity';
import {
  SEED_MODULES,
  SEED_PERMISSIONS,
  SEED_PLANS,
  SEED_PLATFORM_ROLES,
  SEED_TENANT_ROLES,
} from './security-catalog';

/**
 * Bootstrap idempotente del catálogo de seguridad. Al arrancar el módulo:
 * 1. UPSERT de módulos, permisos y planes semilla.
 * 2. Enlaza permisos <-> platform_roles según catálogo.
 * 3. Enlaza módulos <-> planes según catálogo.
 *
 * NO siembra data por tenant: eso lo hace TenantProvisioning cuando se crea un
 * tenant (mediante ensureTenantDefaults()). Este servicio solo garantiza que
 * el catálogo global esté disponible desde el primer arranque.
 */
@Injectable()
export class SecurityBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SecurityBootstrapService.name);

  constructor(
    @InjectRepository(ModuleCatalog) private readonly modules: Repository<ModuleCatalog>,
    @InjectRepository(Permission) private readonly permissions: Repository<Permission>,
    @InjectRepository(PlatformRole) private readonly platformRoles: Repository<PlatformRole>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(PlanModule) private readonly planModules: Repository<PlanModule>,
    @InjectRepository(Role) private readonly tenantRoles: Repository<Role>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.upsertModules();
    await this.upsertPermissions();
    await this.upsertPlans();
    await this.upsertPlanModules();
    await this.upsertPlatformRoles();
    this.logger.log('Security catalog bootstrap done');
  }

  private async upsertModules(): Promise<void> {
    for (const m of SEED_MODULES) {
      const existing = await this.modules.findOne({ where: { key: m.key } });
      if (existing) {
        existing.name = m.name;
        existing.description = m.description;
        existing.category = m.category;
        await this.modules.save(existing);
      } else {
        await this.modules.save(this.modules.create({
          key: m.key,
          name: m.name,
          description: m.description,
          category: m.category,
          isActive: true,
        }));
      }
    }
  }

  private async upsertPermissions(): Promise<void> {
    for (const p of SEED_PERMISSIONS) {
      const existing = await this.permissions.findOne({ where: { key: p.key } });
      if (existing) {
        existing.name = p.name;
        existing.description = p.description ?? null;
        existing.moduleKey = p.moduleKey;
        existing.action = p.action;
        existing.isPlatform = !!p.isPlatform;
        await this.permissions.save(existing);
      } else {
        await this.permissions.save(this.permissions.create({
          key: p.key,
          moduleKey: p.moduleKey,
          action: p.action,
          name: p.name,
          description: p.description ?? null,
          isPlatform: !!p.isPlatform,
        }));
      }
    }
  }

  private async upsertPlans(): Promise<void> {
    for (const p of SEED_PLANS) {
      const existing = await this.plans.findOne({ where: { key: p.key } });
      if (existing) {
        existing.name = p.name;
        existing.description = p.description;
        existing.priceMonthly = p.priceMonthly;
        existing.currency = p.currency;
        existing.maxUsers = p.maxUsers;
        existing.maxStorageGb = p.maxStorageGb;
        await this.plans.save(existing);
      } else {
        await this.plans.save(this.plans.create({
          key: p.key,
          name: p.name,
          description: p.description,
          priceMonthly: p.priceMonthly,
          currency: p.currency,
          maxUsers: p.maxUsers,
          maxStorageGb: p.maxStorageGb,
          isActive: true,
        }));
      }
    }
  }

  private async upsertPlanModules(): Promise<void> {
    for (const p of SEED_PLANS) {
      const plan = await this.plans.findOne({ where: { key: p.key } });
      if (!plan) continue;
      for (const moduleKey of p.modules) {
        const exists = await this.planModules.findOne({
          where: { planId: plan.id, moduleKey },
        });
        if (!exists) {
          await this.planModules.save(this.planModules.create({
            planId: plan.id,
            moduleKey,
          }));
        }
      }
    }
  }

  private async upsertPlatformRoles(): Promise<void> {
    for (const r of SEED_PLATFORM_ROLES) {
      let role = await this.platformRoles.findOne({
        where: { key: r.key },
        relations: ['permissions'],
      });
      if (!role) {
        role = this.platformRoles.create({
          key: r.key,
          name: r.name,
          description: r.description,
          permissions: [],
        });
        role = await this.platformRoles.save(role);
      } else {
        role.name = r.name;
        role.description = r.description;
      }
      const perms = await this.permissions
        .createQueryBuilder('p')
        .where('p.key IN (:...keys)', { keys: r.permissions.length > 0 ? r.permissions : ['__none__'] })
        .getMany();
      role.permissions = perms;
      await this.platformRoles.save(role);
    }
  }

  /**
   * Asegura los roles semilla del tenant. Se invoca al crear un tenant nuevo
   * o al bootstrap para tenants existentes que no tengan roles todavía.
   */
  async ensureTenantDefaultRoles(tenantId: string): Promise<void> {
    for (const r of SEED_TENANT_ROLES) {
      let role = await this.tenantRoles.findOne({
        where: { tenantId, key: r.key },
        relations: ['permissions'],
      });
      const permKeys = r.permissions;
      const perms = await this.permissions
        .createQueryBuilder('p')
        .where('p.key IN (:...keys)', { keys: permKeys.length > 0 ? permKeys : ['__none__'] })
        .getMany();
      if (!role) {
        role = this.tenantRoles.create({
          tenantId,
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          isActive: true,
          permissions: perms,
        });
        await this.tenantRoles.save(role);
      } else {
        // Solo actualiza si el rol es de sistema; si el tenant lo customizó no lo pisamos.
        if (role.isSystem) {
          role.name = r.name;
          role.description = r.description;
          role.permissions = perms;
          await this.tenantRoles.save(role);
        }
      }
    }
  }
}
