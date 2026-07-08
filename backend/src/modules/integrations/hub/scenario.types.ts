/**
 * Escenarios inyectables en cualquier mock adapter. Permiten simular las
 * condiciones reales que el sistema tiene que manejar sin depender de terceros:
 *   - latencia y jitter
 *   - errores HTTP
 *   - timeouts
 *   - fallos de autenticación / autorización
 *   - reglas de negocio (crédito insuficiente, stock agotado, DIAN rechaza CUFE, etc.)
 *   - datos inexistentes / vacíos
 *
 * Los escenarios se persisten por (tenantId, system, operation) y se aplican
 * DENTRO del mock adapter antes de devolver la respuesta feliz. El panel del
 * Bloque 4 escribe/lee estos escenarios; los mocks los consultan.
 */

export type ScenarioBehavior =
  | 'happy_path'
  | 'latency'
  | 'timeout'
  | 'network_error'
  | 'auth_error'
  | 'authz_error'
  | 'business_error'
  | 'invalid_response'
  | 'not_found'
  | 'rate_limited';

export interface ScenarioConfig {
  behavior: ScenarioBehavior;
  latencyMs?: number;
  jitterMs?: number;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  errorRatio?: number;
  metadata?: Record<string, unknown>;
}

export const DEFAULT_SCENARIO: ScenarioConfig = { behavior: 'happy_path' };

/**
 * Contrato del proveedor de escenarios. La implementación por defecto
 * (`StaticScenarioProvider`) siempre devuelve `happy_path`. Bloque 4 registra
 * un proveedor persistente que lee `mock_scenarios` de BD por tenant.
 *
 * Se declara como clase abstracta (no interface) para que Nest pueda
 * inyectarla por tipo bajo `isolatedModules + emitDecoratorMetadata`.
 */
export abstract class ScenarioProvider {
  abstract resolve(
    tenantId: string,
    system: string,
    operation: string,
  ): Promise<ScenarioConfig>;
}

export const SCENARIO_PROVIDER = Symbol('SCENARIO_PROVIDER');
