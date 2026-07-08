import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TenantSubscription,
  SubscriptionStatus,
} from '../../entities/tenant-subscription.entity';
import { PlanModule } from '../../entities/plan-module.entity';
import { TenantFeatureFlag } from '../../entities/tenant-feature-flag.entity';

export interface LicenseResolution {
  tenantId: string;
  planKey: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  modulesEnabled: Set<string>;
  planModules: Set<string>;
  flagOverrides: Record<string, boolean>;
}

/**
 * LicenseService resuelve QUÉ MÓDULOS están habilitados para un tenant.
 *
 * Lógica de combinación:
 *  1. `planModules` = módulos del plan al que está suscrito el tenant.
 *  2. `flagOverrides` = feature flags específicos del tenant.
 *     - flag.enabled = true  → añade el módulo aunque el plan no lo tenga.
 *     - flag.enabled = false → quita el módulo aunque el plan lo tenga.
 *
 * Estado de suscripción:
 *  - `active` o `trial` → aplica el plan normalmente.
 *  - `past_due` → aplica el plan (grace period corto; endurecimiento en Bloque 7).
 *  - `suspended` o `cancelled` → ningún módulo se habilita.
 *
 * Todo lector debe consultar `isModuleEnabled(tenantId, moduleKey)` — nunca
 * inferir de otro lado. El resultado se puede cachear a nivel de request.
 */
@Injectable()
export class LicenseService {
  constructor(
    @InjectRepository(TenantSubscription)
    private readonly subscriptions: Repository<TenantSubscription>,
    @InjectRepository(PlanModule)
    private readonly planModules: Repository<PlanModule>,
    @InjectRepository(TenantFeatureFlag)
    private readonly flags: Repository<TenantFeatureFlag>,
  ) {}

  async resolve(tenantId: string): Promise<LicenseResolution> {
    const subscription = await this.subscriptions.findOne({
      where: { tenantId },
      relations: ['plan'],
    });

    const planModules = new Set<string>();
    let planKey: string | null = null;
    let status: SubscriptionStatus | null = null;
    let subscriptionActive = false;

    if (subscription) {
      status = subscription.status;
      planKey = subscription.plan?.key ?? null;
      subscriptionActive =
        subscription.status === SubscriptionStatus.ACTIVE ||
        subscription.status === SubscriptionStatus.TRIAL ||
        subscription.status === SubscriptionStatus.PAST_DUE;
      if (subscriptionActive) {
        const rows = await this.planModules.find({
          where: { planId: subscription.planId },
        });
        for (const r of rows) planModules.add(r.moduleKey);
      }
    }

    const flagRows = await this.flags.find({ where: { tenantId } });
    const overrides: Record<string, boolean> = {};
    for (const row of flagRows) overrides[row.moduleKey] = row.enabled;

    const enabled = new Set<string>(planModules);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) enabled.add(k);
      else enabled.delete(k);
    }

    return {
      tenantId,
      planKey,
      subscriptionStatus: status,
      modulesEnabled: enabled,
      planModules,
      flagOverrides: overrides,
    };
  }

  async isModuleEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
    const res = await this.resolve(tenantId);
    return res.modulesEnabled.has(moduleKey);
  }
}
