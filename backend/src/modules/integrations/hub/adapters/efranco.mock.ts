import { Inject, Injectable } from '@nestjs/common';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * EFranco mock — operador logístico / agente aduanero para exportaciones.
 *  - cotizar operación
 *  - crear liquidación
 *  - obtener documentos (BL, packing list consolidado, factura de servicios)
 */
@Injectable()
export class EFrancoMockAdapter extends MockAdapterBase {
  readonly system = 'efranco';

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      { operation: 'quote.request', method: 'write', description: 'Solicitar cotización de exportación' },
      { operation: 'liquidation.create', method: 'write', description: 'Crear liquidación aduanera' },
      { operation: 'documents.list', method: 'read', description: 'Listar documentos generados por operación' },
    ];
  }

  protected operationHandlers() {
    return {
      'quote.request': this.wrap((args) => this.quoteRequest(args), 'quote.request'),
      'liquidation.create': this.wrap((args) => this.liquidationCreate(args), 'liquidation.create'),
      'documents.list': this.wrap((args) => this.documentsList(args), 'documents.list'),
    };
  }

  private quoteRequest(args: Record<string, unknown>) {
    const origin = String(args.origin ?? '');
    const destination = String(args.destination ?? '');
    const grossWeightKg = Number(args.grossWeightKg ?? 0);
    if (!origin || !destination) throw new Error('BUSINESS_ERROR: origin/destination requeridos');
    if (grossWeightKg <= 0) throw new Error('BUSINESS_ERROR: grossWeightKg > 0');
    const base = 3200; // USD flat
    const perKg = 0.85;
    const totalUsd = Math.round((base + grossWeightKg * perKg) * 100) / 100;
    return {
      quoteId: `EFQ-${Date.now()}`,
      origin,
      destination,
      grossWeightKg,
      transitDays: 18,
      currency: 'USD',
      subtotal: totalUsd,
      taxes: Math.round(totalUsd * 0.04 * 100) / 100,
      total: Math.round(totalUsd * 1.04 * 100) / 100,
      validUntil: new Date(Date.now() + 15 * 24 * 3600_000).toISOString(),
    };
  }

  private liquidationCreate(args: Record<string, unknown>) {
    const quoteId = String(args.quoteId ?? '');
    const invoiceNumber = String(args.invoiceNumber ?? '');
    if (!quoteId) throw new Error('BUSINESS_ERROR: quoteId requerido');
    return {
      liquidationId: `EFL-${Date.now()}`,
      quoteId,
      invoiceNumber,
      status: 'IN_PROGRESS',
      customsRef: `CUS-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
  }

  private documentsList(args: Record<string, unknown>) {
    const liquidationId = String(args.liquidationId ?? '');
    if (!liquidationId) throw new Error('BUSINESS_ERROR: liquidationId requerido');
    return {
      liquidationId,
      documents: [
        { type: 'BILL_OF_LADING', code: `BL-${liquidationId.slice(-6)}`, url: 'https://mock-efranco.local/bl' },
        { type: 'PACKING_LIST', code: `PL-${liquidationId.slice(-6)}`, url: 'https://mock-efranco.local/pl' },
        { type: 'INVOICE', code: `INV-${liquidationId.slice(-6)}`, url: 'https://mock-efranco.local/inv' },
      ],
    };
  }
}
