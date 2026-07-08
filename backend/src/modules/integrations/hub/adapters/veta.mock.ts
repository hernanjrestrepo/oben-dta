import { Inject, Injectable } from '@nestjs/common';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * VETA mock — sistema de producción/producto de Oben (programación de
 * producción, estado de órdenes de planta, catálogo de producto).
 * Config real futura vía VETA_BASE_URL/VETA_API_KEY (ya reservadas en env).
 */
@Injectable()
export class VetaMockAdapter extends MockAdapterBase {
  readonly system = 'veta';

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      {
        operation: 'production.schedule',
        method: 'write',
        description: 'Programar orden de producción',
      },
      {
        operation: 'production.status',
        method: 'read',
        description: 'Consultar estado de producción',
      },
      {
        operation: 'product.catalog.sync',
        method: 'read',
        description: 'Sincronizar catálogo de producto',
      },
    ];
  }

  protected operationHandlers() {
    return {
      'production.schedule': this.wrap(
        (args) => this.productionSchedule(args),
        'production.schedule',
      ),
      'production.status': this.wrap(
        (args) => this.productionStatus(args),
        'production.status',
      ),
      'product.catalog.sync': this.wrap(
        () => this.catalogSync(),
        'product.catalog.sync',
      ),
    };
  }

  private productionSchedule(args: Record<string, unknown>) {
    const sku = String(args.sku ?? '');
    const quantity = Number(args.quantity ?? 0);
    if (!sku) throw new Error('BUSINESS_ERROR: sku requerido');
    if (quantity <= 0) throw new Error('BUSINESS_ERROR: quantity > 0');
    return {
      productionOrderId: `VETA-PO-${Date.now()}`,
      sku,
      quantity,
      status: 'SCHEDULED',
      plannedStart: new Date(Date.now() + 24 * 3600_000).toISOString(),
      plannedEnd: new Date(Date.now() + 4 * 24 * 3600_000).toISOString(),
    };
  }

  private productionStatus(args: Record<string, unknown>) {
    const productionOrderId = String(args.productionOrderId ?? '');
    if (!productionOrderId)
      throw new Error('BUSINESS_ERROR: productionOrderId requerido');
    const phase = Number(productionOrderId.slice(-1)) % 4;
    const stages = ['SCHEDULED', 'IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED'];
    return {
      productionOrderId,
      status: stages[phase],
      progressPct: [10, 45, 85, 100][phase],
    };
  }

  private catalogSync() {
    return {
      products: [
        { sku: 'SKU-001', name: 'Producto A', unit: 'UND', active: true },
        { sku: 'SKU-002', name: 'Producto B', unit: 'UND', active: true },
      ],
      syncedAt: new Date().toISOString(),
    };
  }
}
