import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Plan } from '../../entities/plan.entity';
import { PlanModule } from '../../entities/plan-module.entity';
import { ModuleCatalog } from '../../entities/module-catalog.entity';
import {
  TenantSubscription,
  SubscriptionStatus,
} from '../../entities/tenant-subscription.entity';
import { TenantFeatureFlag } from '../../entities/tenant-feature-flag.entity';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(PlanModule)
    private readonly planModules: Repository<PlanModule>,
    @InjectRepository(ModuleCatalog)
    private readonly modules: Repository<ModuleCatalog>,
    @InjectRepository(TenantSubscription)
    private readonly subs: Repository<TenantSubscription>,
    @InjectRepository(TenantFeatureFlag)
    private readonly flags: Repository<TenantFeatureFlag>,
  ) {}

  async list(): Promise<Array<Plan & { modules: string[] }>> {
    const plans = await this.plans.find({ order: { priceMonthly: 'ASC' } });
    const allModules = await this.planModules.find();
    return plans.map((p) => ({
      ...p,
      modules: allModules
        .filter((m) => m.planId === p.id)
        .map((m) => m.moduleKey),
    }));
  }

  async getByKey(key: string): Promise<Plan & { modules: string[] }> {
    const plan = await this.plans.findOne({ where: { key } });
    if (!plan) throw new NotFoundException(`Plan '${key}' no existe`);
    const modules = await this.planModules.find({ where: { planId: plan.id } });
    return { ...plan, modules: modules.map((m) => m.moduleKey) };
  }

  async create(dto: {
    key: string;
    name: string;
    description?: string;
    priceMonthly?: number;
    currency?: string;
    maxUsers?: number;
    maxStorageGb?: number;
    modules: string[];
  }): Promise<Plan & { modules: string[] }> {
    const existing = await this.plans.findOne({ where: { key: dto.key } });
    if (existing) throw new ConflictException(`Plan '${dto.key}' ya existe`);
    await this.assertModulesExist(dto.modules);
    const plan = await this.plans.save(
      this.plans.create({
        key: dto.key,
        name: dto.name,
        description: dto.description,
        priceMonthly: dto.priceMonthly ?? 0,
        currency: dto.currency ?? 'USD',
        maxUsers: dto.maxUsers ?? 0,
        maxStorageGb: dto.maxStorageGb ?? 0,
        isActive: true,
      }),
    );
    for (const moduleKey of dto.modules) {
      await this.planModules.save(
        this.planModules.create({ planId: plan.id, moduleKey }),
      );
    }
    return this.getByKey(plan.key);
  }

  async updateModules(
    key: string,
    modules: string[],
  ): Promise<Plan & { modules: string[] }> {
    const plan = await this.plans.findOne({ where: { key } });
    if (!plan) throw new NotFoundException(`Plan '${key}' no existe`);
    await this.assertModulesExist(modules);
    await this.planModules.delete({ planId: plan.id });
    for (const moduleKey of modules) {
      await this.planModules.save(
        this.planModules.create({ planId: plan.id, moduleKey }),
      );
    }
    return this.getByKey(plan.key);
  }

  async assignSubscription(
    tenantId: string,
    dto: { planKey: string; status?: SubscriptionStatus; endsAt?: string },
  ): Promise<TenantSubscription> {
    const plan = await this.plans.findOne({ where: { key: dto.planKey } });
    if (!plan) throw new NotFoundException(`Plan '${dto.planKey}' no existe`);
    let sub = await this.subs.findOne({ where: { tenantId } });
    if (!sub) {
      sub = this.subs.create({
        tenantId,
        planId: plan.id,
        status: dto.status ?? SubscriptionStatus.ACTIVE,
        startsAt: new Date(),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      });
    } else {
      sub.planId = plan.id;
      if (dto.status) sub.status = dto.status;
      if (dto.endsAt !== undefined)
        sub.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    }
    return this.subs.save(sub);
  }

  async setFeatureFlag(
    tenantId: string,
    dto: { moduleKey: string; enabled: boolean; reason?: string },
    setBy?: string,
  ): Promise<TenantFeatureFlag> {
    const module = await this.modules.findOne({
      where: { key: dto.moduleKey },
    });
    if (!module)
      throw new NotFoundException(`Módulo '${dto.moduleKey}' no existe`);
    let flag = await this.flags.findOne({
      where: { tenantId, moduleKey: dto.moduleKey },
    });
    if (!flag) {
      flag = this.flags.create({
        tenantId,
        moduleKey: dto.moduleKey,
        enabled: dto.enabled,
        reason: dto.reason ?? null,
        setBy: setBy ?? null,
      });
    } else {
      flag.enabled = dto.enabled;
      flag.reason = dto.reason ?? null;
      flag.setBy = setBy ?? null;
    }
    return this.flags.save(flag);
  }

  async listFeatureFlags(tenantId: string): Promise<TenantFeatureFlag[]> {
    return this.flags.find({ where: { tenantId } });
  }

  async getTenantSubscription(
    tenantId: string,
  ): Promise<TenantSubscription | null> {
    return this.subs.findOne({ where: { tenantId }, relations: ['plan'] });
  }

  private async assertModulesExist(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const found = await this.modules.find({ where: { key: In(keys) } });
    const foundKeys = new Set(found.map((m) => m.key));
    const missing = keys.filter((k) => !foundKeys.has(k));
    if (missing.length > 0) {
      throw new BadRequestException(`Módulos inválidos: ${missing.join(', ')}`);
    }
  }
}
