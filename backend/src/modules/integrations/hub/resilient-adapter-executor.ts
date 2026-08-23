import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationDeadLetter } from '../../../entities/integration-dead-letter.entity';
import {
  AdapterCallContext,
  AdapterCallResult,
  AdapterMode,
  IntegrationAdapter,
} from './adapter.types';

export interface ResilienceOptions {
  /** Intentos totales, incluyendo el primero. Default 3. */
  maxAttempts?: number;
  /** Base del backoff exponencial (ms): intento N espera base*2^(N-1). Default 200. */
  baseDelayMs?: number;
  /** Timeout por intento. Default 10000. */
  timeoutMs?: number;
  /** Fallos consecutivos para abrir el circuito. Default 5. */
  circuitThreshold?: number;
  /** Cuánto se mantiene abierto el circuito antes de un intento half-open. Default 30000. */
  circuitCooldownMs?: number;
}

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number | null;
}

const DEFAULTS: Required<ResilienceOptions> = {
  maxAttempts: 3,
  baseDelayMs: 200,
  timeoutMs: 10_000,
  circuitThreshold: 5,
  circuitCooldownMs: 30_000,
};

/**
 * Envuelve `IntegrationAdapter.execute()` con retry + backoff exponencial +
 * timeout configurable + circuit breaker + dead letter (WO-018 Sprint 3).
 * Único punto de entrada para TODA llamada a una integración externa —
 * `IntegrationHubService.call()`, `SendEmailAction`, `OracleAdapter` pasan
 * por aquí, nunca llaman `adapter.execute()` directamente.
 *
 * No reintenta errores de negocio (`BUSINESS_ERROR:` — convención ya usada
 * en los mocks) ni `pending_credentials`: reintentar una entrada inválida o
 * una config faltante nunca cambia el resultado. Solo reintenta fallas
 * transitorias (`network_error`, `timeout`, `rate_limited`, excepciones no
 * clasificadas, etc.).
 */
@Injectable()
export class ResilientAdapterExecutor {
  private readonly logger = new Logger(ResilientAdapterExecutor.name);
  private readonly circuits = new Map<string, CircuitState>();

  constructor(
    @InjectRepository(IntegrationDeadLetter)
    private readonly deadLetters: Repository<IntegrationDeadLetter>,
  ) {}

  async execute<T = unknown>(
    adapter: IntegrationAdapter,
    operation: string,
    args: Record<string, unknown>,
    ctx: AdapterCallContext,
    options: ResilienceOptions = {},
  ): Promise<AdapterCallResult<T>> {
    const opts = { ...DEFAULTS, ...options };
    const key = `${ctx.tenantId}:${adapter.system}`;
    const circuit = this.circuitFor(key);

    if (circuit.openUntil !== null) {
      if (Date.now() < circuit.openUntil) {
        return this.circuitOpenResult<T>(adapter.system, adapter.mode, operation, circuit.openUntil);
      }
      // Cooldown vencido: half-open, deja pasar un intento de prueba.
      circuit.openUntil = null;
    }

    let lastResult: AdapterCallResult<T> | undefined;
    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      const result = await this.attemptOnce<T>(adapter, operation, args, ctx, opts.timeoutMs);
      lastResult = result;

      if (result.ok) {
        circuit.consecutiveFailures = 0;
        return result;
      }
      if (this.isNonRetryable(result)) {
        return result; // error de negocio o credenciales — no cuenta contra el circuito
      }
      if (attempt < opts.maxAttempts) {
        this.logger.warn(
          `[${adapter.system}.${operation}] intento ${attempt}/${opts.maxAttempts} falló (${result.error}) — reintentando en ${opts.baseDelayMs * 2 ** (attempt - 1)}ms`,
        );
        await this.delay(opts.baseDelayMs * 2 ** (attempt - 1));
      }
    }

    // Agotados los reintentos con fallas transitorias reales.
    circuit.consecutiveFailures += 1;
    let circuitOpened = false;
    if (circuit.consecutiveFailures >= opts.circuitThreshold) {
      circuit.openUntil = Date.now() + opts.circuitCooldownMs;
      circuitOpened = true;
      this.logger.warn(
        `circuit_open: "${key}" tras ${circuit.consecutiveFailures} fallos consecutivos — enfriamiento ${opts.circuitCooldownMs}ms`,
      );
    }

    await this.deadLetters.save(
      this.deadLetters.create({
        tenantId: ctx.tenantId,
        system: adapter.system,
        operation,
        args,
        error: lastResult?.error ?? 'unknown_error',
        attempts: opts.maxAttempts,
        circuitOpen: circuitOpened,
      }),
    );

    return lastResult as AdapterCallResult<T>;
  }

  /** Solo para observabilidad/pruebas — estado actual de los circuitos conocidos. */
  getCircuitStatus(): Array<{ key: string; consecutiveFailures: number; open: boolean }> {
    return Array.from(this.circuits.entries()).map(([key, c]) => ({
      key,
      consecutiveFailures: c.consecutiveFailures,
      open: c.openUntil !== null && Date.now() < c.openUntil,
    }));
  }

  private async attemptOnce<T>(
    adapter: IntegrationAdapter,
    operation: string,
    args: Record<string, unknown>,
    ctx: AdapterCallContext,
    timeoutMs: number,
  ): Promise<AdapterCallResult<T>> {
    let timer: ReturnType<typeof setTimeout>;
    const timeoutResult: AdapterCallResult<T> = {
      ok: false,
      state: 'unreachable',
      error: `timeout: sin respuesta de "${adapter.system}.${operation}" tras ${timeoutMs}ms`,
      durationMs: timeoutMs,
      mode: adapter.mode,
      system: adapter.system,
      operation,
    };
    const timeout = new Promise<AdapterCallResult<T>>((resolve) => {
      timer = setTimeout(() => resolve(timeoutResult), timeoutMs);
    });
    try {
      return await Promise.race([adapter.execute<T>(operation, args, ctx), timeout]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        state: 'unreachable',
        error: message,
        durationMs: 0,
        mode: adapter.mode,
        system: adapter.system,
        operation,
      };
    } finally {
      clearTimeout(timer!);
    }
  }

  private isNonRetryable(result: AdapterCallResult<unknown>): boolean {
    if (result.state === 'pending_credentials') return true;
    return (result.error ?? '').startsWith('BUSINESS_ERROR:');
  }

  private circuitFor(key: string): CircuitState {
    let c = this.circuits.get(key);
    if (!c) {
      c = { consecutiveFailures: 0, openUntil: null };
      this.circuits.set(key, c);
    }
    return c;
  }

  private circuitOpenResult<T>(
    system: string,
    mode: AdapterMode,
    operation: string,
    openUntil: number,
  ): AdapterCallResult<T> {
    return {
      ok: false,
      state: 'unreachable',
      error: `circuit_open: demasiados fallos consecutivos en "${system}", en enfriamiento hasta ${new Date(openUntil).toISOString()}`,
      durationMs: 0,
      mode,
      system,
      operation,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
