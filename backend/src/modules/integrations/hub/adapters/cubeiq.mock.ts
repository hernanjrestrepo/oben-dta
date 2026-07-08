import { Inject, Injectable } from '@nestjs/common';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * CubeIQ mock — motor de optimización de cubicaje / packing.
 * Recibe items con dimensiones y devuelve plan óptimo de cajas/pallets.
 *
 * Cálculo simplificado: volumen total / capacidad de contenedor + heurística
 * de aprovechamiento. Determinista para poder probar workflows de exportación.
 */
@Injectable()
export class CubeIQMockAdapter extends MockAdapterBase {
  readonly system = 'cubeiq';

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      { operation: 'plan.optimize', method: 'read', description: 'Calcular plan óptimo de packing' },
      { operation: 'plan.validate', method: 'read', description: 'Validar un plan de packing' },
    ];
  }

  protected operationHandlers() {
    return {
      'plan.optimize': this.wrap((args) => this.planOptimize(args), 'plan.optimize'),
      'plan.validate': this.wrap((args) => this.planValidate(args), 'plan.validate'),
    };
  }

  private planOptimize(args: Record<string, unknown>) {
    const items = (args.items as Array<{ sku: string; qty: number; volumeCm3: number; weightGr: number }>) ?? [];
    if (items.length === 0) {
      throw new Error('BUSINESS_ERROR: items[] vacío');
    }
    const container = (args.container as { code?: string; volumeCm3?: number; maxWeightGr?: number }) ?? {
      code: '40HC',
      volumeCm3: 76_000_000,
      maxWeightGr: 26_500_000,
    };
    const totalVolume = items.reduce((s, i) => s + Number(i.volumeCm3) * Number(i.qty), 0);
    const totalWeight = items.reduce((s, i) => s + Number(i.weightGr) * Number(i.qty), 0);
    const utilizationVolume = totalVolume / Number(container.volumeCm3 ?? 1);
    const utilizationWeight = totalWeight / Number(container.maxWeightGr ?? 1);
    const containers = Math.max(1, Math.ceil(Math.max(utilizationVolume, utilizationWeight)));

    return {
      planId: `CUBE-${Date.now()}`,
      container: container.code ?? '40HC',
      containers,
      totalVolumeCm3: totalVolume,
      totalWeightGr: totalWeight,
      volumeUtilization: Math.min(1, utilizationVolume / containers),
      weightUtilization: Math.min(1, utilizationWeight / containers),
      layout: items.map((i, idx) => ({
        sku: i.sku,
        qty: i.qty,
        containerIndex: idx % containers,
      })),
    };
  }

  private planValidate(args: Record<string, unknown>) {
    const planId = String(args.planId ?? '');
    if (!planId) throw new Error('BUSINESS_ERROR: planId requerido');
    return {
      planId,
      valid: true,
      warnings: [],
      validatedAt: new Date().toISOString(),
    };
  }
}
