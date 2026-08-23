import { Injectable } from '@nestjs/common';
import { AdapterRegistry } from './adapter-registry';
import {
  AdapterCallResult,
  AdapterHealth,
  IntegrationSystem,
  INTEGRATION_SYSTEMS,
} from './adapter.types';
import { TenantContext } from '../../../common/tenant/tenant-context.service';
import { ResilienceOptions, ResilientAdapterExecutor } from './resilient-adapter-executor';

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
    private readonly resilientExecutor: ResilientAdapterExecutor,
  ) {}

  /**
   * `options` permite ajustar retry/timeout/circuit breaker por llamada
   * (WO-018 Sprint 3) — sin eso, aplican los defaults de
   * `ResilientAdapterExecutor` (3 intentos, backoff 200ms, timeout 10s,
   * circuito a los 5 fallos consecutivos).
   */
  async call<T = unknown>(
    system: IntegrationSystem,
    operation: string,
    args: Record<string, unknown> = {},
    options?: ResilienceOptions,
  ): Promise<AdapterCallResult<T>> {
    const tenantId = this.ctx.tenantId;
    const adapter = await this.registry.resolve(tenantId, system);
    return this.resilientExecutor.execute<T>(
      adapter,
      operation,
      args,
      { tenantId, userId: this.ctx.userId },
      options,
    );
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
