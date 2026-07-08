import { Injectable } from '@nestjs/common';
import { AdapterRegistry } from './adapter-registry';
import {
  AdapterCallResult,
  AdapterHealth,
  IntegrationSystem,
  INTEGRATION_SYSTEMS,
} from './adapter.types';
import { TenantContext } from '../../../common/tenant/tenant-context.service';

export interface HubStatusEntry {
  system: IntegrationSystem;
  mode: AdapterHealth['mode'];
  state: AdapterHealth['state'];
  message: string;
  latencyMs: number | null;
}

/**
 * IntegrationHub: la única puerta de entrada del sistema al mundo externo.
 * Consumidores llaman a `call(system, operation, args)` — la resolución de
 * Real vs Mock, la configuración por tenant y la aplicación de escenarios es
 * transparente. Nunca acoplar la lógica de negocio a un adapter concreto.
 */
@Injectable()
export class IntegrationHubService {
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly ctx: TenantContext,
  ) {}

  async call<T = unknown>(
    system: IntegrationSystem,
    operation: string,
    args: Record<string, unknown> = {},
  ): Promise<AdapterCallResult<T>> {
    const tenantId = this.ctx.tenantId;
    const adapter = await this.registry.resolve(tenantId, system);
    return adapter.execute<T>(operation, args, {
      tenantId,
      userId: this.ctx.userId,
    });
  }

  async status(): Promise<HubStatusEntry[]> {
    const tenantId = this.ctx.tenantId;
    const entries: HubStatusEntry[] = [];
    for (const system of INTEGRATION_SYSTEMS) {
      const adapter = await this.registry.resolve(tenantId, system);
      const health = await adapter.health();
      entries.push({
        system,
        mode: health.mode,
        state: health.state,
        message: health.message,
        latencyMs: health.latencyMs,
      });
    }
    return entries;
  }

  async capabilities(system: IntegrationSystem) {
    const adapter = await this.registry.resolve(this.ctx.tenantId, system);
    return {
      system: adapter.system,
      mode: adapter.mode,
      capabilities: adapter.capabilities(),
    };
  }
}
