import { ScenarioBehavior, ScenarioConfig } from './scenario.types';

/**
 * Aplica el escenario configurado antes de devolver la respuesta feliz.
 * Lanza excepciones cuyo tipo/mensaje el BaseAdapter interpreta como
 * estado 'error' o 'pending_credentials'.
 *
 * `applyScenario` NUNCA usa Math.random directamente en producción salvo para
 * `errorRatio` — para eso acepta un RNG opcional (útil en tests deterministas).
 */
export async function applyScenario(
  scenario: ScenarioConfig,
  rng: () => number = Math.random,
): Promise<void> {
  const behavior = scenario.behavior;

  // Latencia base y jitter, aplicable a cualquier comportamiento.
  const latency = (scenario.latencyMs ?? 0) + jitter(scenario.jitterMs, rng);
  if (latency > 0) await sleep(latency);

  if (behavior === 'happy_path') return;

  if (behavior === 'timeout') {
    const wait = Math.max(scenario.latencyMs ?? 30000, 5000);
    await sleep(wait);
    throw new Error(scenario.errorMessage ?? 'timeout: sistema externo tardó demasiado');
  }

  // Errores con ratio: solo dispara si rng() < errorRatio
  if (scenario.errorRatio !== undefined) {
    if (rng() >= scenario.errorRatio) return;
  }

  switch (behavior) {
    case 'network_error':
      throw new Error(
        scenario.errorMessage ?? 'network_error: conexión rechazada por el sistema externo',
      );
    case 'auth_error':
      throw new Error(
        scenario.errorMessage ?? 'auth_error: credenciales inválidas o expiradas',
      );
    case 'authz_error':
      throw new Error(
        scenario.errorMessage ?? 'authz_error: sin permisos para esta operación',
      );
    case 'rate_limited':
      throw new Error(
        scenario.errorMessage ?? 'rate_limited: cuota excedida (HTTP 429)',
      );
    case 'invalid_response':
      throw new Error(
        scenario.errorMessage ?? 'invalid_response: payload no cumple contrato',
      );
    case 'business_error':
      throw new Error(
        `${scenario.errorCode ?? 'BUSINESS_ERROR'}: ${scenario.errorMessage ?? 'regla de negocio rechazó la operación'}`,
      );
    case 'not_found':
      // No lanza — devuelve señal para que el handler responda vacío.
      throw new NotFoundSignal(scenario.errorMessage ?? 'not_found: entidad no existe');
    case 'latency':
      // Ya se aplicó la latencia arriba.
      return;
    default:
      return assertNever(behavior);
  }
}

export class NotFoundSignal extends Error {
  readonly notFound = true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(max: number | undefined, rng: () => number): number {
  if (!max) return 0;
  return Math.floor(rng() * max);
}

function assertNever(x: never): never {
  throw new Error(`escenario no manejado: ${x as string}`);
}
