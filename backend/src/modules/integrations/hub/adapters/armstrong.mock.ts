import { Inject, Injectable } from '@nestjs/common';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * Armstrong mock — logística/despacho de Oben (creación de despachos, tracking
 * de entrega, consulta de inventario de bodega). Config real futura vía
 * ARMSTRONG_BASE_URL/ARMSTRONG_TOKEN (ya reservadas en env).
 */
@Injectable()
export class ArmstrongMockAdapter extends MockAdapterBase {
  readonly system = 'armstrong';

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      {
        operation: 'dispatch.create',
        method: 'write',
        description: 'Crear despacho hacia cliente',
      },
      {
        operation: 'dispatch.track',
        method: 'read',
        description: 'Rastrear estado de despacho',
      },
      {
        operation: 'warehouse.inventory.check',
        method: 'read',
        description: 'Consultar inventario de bodega',
      },
    ];
  }

  protected operationHandlers() {
    return {
      'dispatch.create': this.wrap(
        (args) => this.dispatchCreate(args),
        'dispatch.create',
      ),
      'dispatch.track': this.wrap(
        (args) => this.dispatchTrack(args),
        'dispatch.track',
      ),
      'warehouse.inventory.check': this.wrap(
        (args) => this.inventoryCheck(args),
        'warehouse.inventory.check',
      ),
    };
  }

  private dispatchCreate(args: Record<string, unknown>) {
    const orderNumber = String(args.orderNumber ?? '');
    const warehouse = String(args.warehouse ?? 'PRINCIPAL');
    if (!orderNumber) throw new Error('BUSINESS_ERROR: orderNumber requerido');
    return {
      dispatchId: `ARM-DSP-${Date.now()}`,
      orderNumber,
      warehouse,
      status: 'DISPATCHED',
      dispatchedAt: new Date().toISOString(),
    };
  }

  private dispatchTrack(args: Record<string, unknown>) {
    const dispatchId = String(args.dispatchId ?? '');
    if (!dispatchId) throw new Error('BUSINESS_ERROR: dispatchId requerido');
    const phase = Number(dispatchId.slice(-1)) % 3;
    const stages = ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED'];
    return { dispatchId, status: stages[phase] };
  }

  private inventoryCheck(args: Record<string, unknown>) {
    const sku = String(args.sku ?? '');
    if (!sku) throw new Error('BUSINESS_ERROR: sku requerido');
    const seed = sku.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return {
      sku,
      warehouse: 'PRINCIPAL',
      availableQty: seed % 500,
      reservedQty: seed % 50,
    };
  }
}
