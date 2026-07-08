import { Injectable } from '@nestjs/common';
import { IntegrationHubService } from './hub/integration-hub.service';

export interface LegacyIntegrationCallResult<T = unknown> {
  ok: boolean;
  state: string;
  data?: T;
  error?: string;
  durationMs: number;
}

/**
 * Fachada legacy — preserva la superficie que EVA Tools consume hoy (getVendors,
 * getItems, getPurchaseOrders, getReceipts, runSuiteQL) delegando todo al nuevo
 * IntegrationHub. Bloque 10 documenta el flujo nuevo y remueve esta fachada.
 *
 * `getVendors(date)` se resuelve como `hub.call('oben','products.list',...)`
 * temporalmente hasta que Bloque 6 (workflows) mapee operaciones a tools EVA
 * de forma explícita.
 */
@Injectable()
export class IntegrationsService {
  constructor(private readonly hub: IntegrationHubService) {}

  async getVendors(_date: string) {
    const r = await this.hub.call<{ suppliers: unknown[] }>(
      'oracle',
      'ap.getSuppliers',
      {},
    );
    return { result: this.toLegacy(r), vendors: r.data?.suppliers ?? [] };
  }

  async getItems(_date: string) {
    const r = await this.hub.call<{ items: unknown[] }>(
      'oben',
      'products.list',
      {},
    );
    return { result: this.toLegacy(r), items: r.data?.items ?? [] };
  }

  async getPurchaseOrders(_date: string) {
    const r = await this.hub.call('oracle', 'ap.getSuppliers', {});
    return { result: this.toLegacy(r), purchaseOrders: [] };
  }

  async getReceipts(_by: { date?: string; poNumber?: string }) {
    const r = await this.hub.call('oben', 'inventory.stock', {
      sku: 'SKU-1000',
    });
    return { result: this.toLegacy(r), receipts: [] };
  }

  async runSuiteQL(query: string): Promise<LegacyIntegrationCallResult> {
    const r = await this.hub.call('oracle', 'gl.getAccounts', { query });
    return this.toLegacy(r);
  }

  async status() {
    const entries = await this.hub.status();
    return entries.map((e) => ({
      name: e.system,
      configured: e.state !== 'pending_credentials',
      authScheme: e.mode,
    }));
  }

  private toLegacy(r: {
    ok: boolean;
    state: string;
    error?: string;
    durationMs: number;
    data?: unknown;
  }): LegacyIntegrationCallResult {
    return {
      ok: r.ok,
      state: r.state,
      error: r.error,
      durationMs: r.durationMs,
      data: r.data,
    };
  }
}
