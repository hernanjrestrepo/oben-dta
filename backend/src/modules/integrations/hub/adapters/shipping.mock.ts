import { Inject, Injectable } from '@nestjs/common';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * Shipping mock — carriers/couriers (Maersk, DHL, FedEx, transportistas locales).
 *   - crear guía / etiqueta
 *   - trackear estado por número
 *   - cotizar por origen/destino/peso
 */
@Injectable()
export class ShippingMockAdapter extends MockAdapterBase {
  readonly system = 'shipping';

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      {
        operation: 'label.create',
        method: 'write',
        description: 'Crear guía / etiqueta de envío',
      },
      {
        operation: 'tracking.get',
        method: 'read',
        description: 'Consultar estado por tracking',
      },
      { operation: 'rate.get', method: 'read', description: 'Cotizar envío' },
    ];
  }

  protected operationHandlers() {
    return {
      'label.create': this.wrap(
        (args) => this.labelCreate(args),
        'label.create',
      ),
      'tracking.get': this.wrap(
        (args) => this.trackingGet(args),
        'tracking.get',
      ),
      'rate.get': this.wrap((args) => this.rateGet(args), 'rate.get'),
    };
  }

  private labelCreate(args: Record<string, unknown>) {
    const carrier = String(args.carrier ?? 'GENERIC');
    const to = args.to as {
      name?: string;
      address?: string;
      city?: string;
      country?: string;
    };
    if (!to?.address) throw new Error('BUSINESS_ERROR: destinatario requerido');
    const tracking = `${carrier.toUpperCase().slice(0, 3)}${Date.now()}`;
    return {
      tracking,
      carrier,
      labelUrl: `https://mock-shipping.local/label/${tracking}.pdf`,
      status: 'CREATED',
      createdAt: new Date().toISOString(),
    };
  }

  private trackingGet(args: Record<string, unknown>) {
    const tracking = String(args.tracking ?? '');
    if (!tracking) throw new Error('BUSINESS_ERROR: tracking requerido');
    // Ciclo determinista según último dígito del tracking (0..9 -> 5 fases).
    const phase = Number(tracking.slice(-1)) % 5;
    const stages = [
      'PICKED_UP',
      'IN_TRANSIT',
      'CUSTOMS_CLEARANCE',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ];
    return {
      tracking,
      status: stages[phase],
      history: stages.slice(0, phase + 1).map((s, i) => ({
        stage: s,
        at: new Date(Date.now() - (phase - i) * 24 * 3600_000).toISOString(),
      })),
    };
  }

  private rateGet(args: Record<string, unknown>) {
    const weightKg = Number(args.weightKg ?? 0);
    if (weightKg <= 0) throw new Error('BUSINESS_ERROR: weightKg > 0');
    const carriers = ['maersk', 'dhl', 'fedex'];
    return {
      quotes: carriers.map((c, i) => ({
        carrier: c,
        transitDays: 3 + i * 2,
        currency: 'USD',
        total: Math.round((25 + weightKg * (1 + i * 0.3)) * 100) / 100,
      })),
    };
  }
}
