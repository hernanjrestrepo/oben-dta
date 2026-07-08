import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MockScenario } from '../../../entities/mock-scenario.entity';
import { DEFAULT_SCENARIO, ScenarioConfig, ScenarioProvider } from './scenario.types';

/**
 * Proveedor persistente. Lee `mock_scenarios` de BD y traduce a ScenarioConfig.
 * Caché de 5s por (tenant, system, operation) para no golpear la BD en cada
 * llamada del hub durante una demo o carga de pruebas.
 */
@Injectable()
export class PersistentScenarioProvider extends ScenarioProvider {
  private static readonly TTL_MS = 5000;
  private readonly cache = new Map<string, { at: number; value: ScenarioConfig }>();

  constructor(
    @InjectRepository(MockScenario)
    private readonly repo: Repository<MockScenario>,
  ) {
    super();
  }

  async resolve(tenantId: string, system: string, operation: string): Promise<ScenarioConfig> {
    const key = `${tenantId}|${system}|${operation}`;
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && now - cached.at < PersistentScenarioProvider.TTL_MS) {
      return cached.value;
    }
    const row = await this.repo.findOne({
      where: { tenantId, system, operation, enabled: true },
    });
    const value: ScenarioConfig = row ? this.toConfig(row) : DEFAULT_SCENARIO;
    this.cache.set(key, { at: now, value });
    return value;
  }

  /** Invalida caché (útil tras upsert/borrado desde el panel). */
  invalidate(tenantId: string, system?: string, operation?: string): void {
    if (!system) {
      for (const k of this.cache.keys()) {
        if (k.startsWith(`${tenantId}|`)) this.cache.delete(k);
      }
      return;
    }
    if (!operation) {
      for (const k of this.cache.keys()) {
        if (k.startsWith(`${tenantId}|${system}|`)) this.cache.delete(k);
      }
      return;
    }
    this.cache.delete(`${tenantId}|${system}|${operation}`);
  }

  private toConfig(row: MockScenario): ScenarioConfig {
    return {
      behavior: row.behavior as ScenarioConfig['behavior'],
      latencyMs: row.latencyMs ?? undefined,
      jitterMs: row.jitterMs ?? undefined,
      httpStatus: row.httpStatus ?? undefined,
      errorCode: row.errorCode ?? undefined,
      errorMessage: row.errorMessage ?? undefined,
      errorRatio: row.errorRatio !== null ? Number(row.errorRatio) : undefined,
      metadata: row.metadata ?? undefined,
    };
  }
}
