import { Logger } from '@nestjs/common';
import {
  AdapterCallContext,
  AdapterCallResult,
  AdapterCapability,
  AdapterHealth,
  AdapterMode,
  AdapterState,
  BaseAdapterConfig,
  IntegrationAdapter,
} from './adapter.types';

/**
 * Base para adapters concretos. Cubre:
 *  - cronometrado de la llamada
 *  - captura de errores → estado 'error'
 *  - conversión uniforme a AdapterCallResult
 *  - despacho por nombre de operación a métodos de la subclase
 *
 * Subclases implementan operationHandlers() y capabilities().
 * El logger cae en el bus de auditoría (IntegrationAuditService) si está montado.
 */
export abstract class BaseAdapter implements IntegrationAdapter {
  abstract readonly system: string;
  abstract readonly mode: AdapterMode;

  protected readonly logger: Logger;
  protected readonly config: BaseAdapterConfig;

  constructor(config: BaseAdapterConfig = {}) {
    this.config = { timeoutMs: 15000, ...config };
    this.logger = new Logger(`Adapter:${this.constructor.name}`);
  }

  abstract capabilities(): AdapterCapability[];

  /**
   * Cada subclase declara un mapa operación → handler.
   * Se prefiere despacho por nombre en lugar de un `switch` para que capabilities()
   * y las operaciones reales estén siempre alineadas.
   */
  protected abstract operationHandlers(): Record<
    string,
    (args: Record<string, unknown>, ctx: AdapterCallContext) => Promise<unknown>
  >;

  async health(): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const state = await this.checkHealth();
      return {
        state,
        mode: this.mode,
        latencyMs: Date.now() - started,
        message: state === 'operational' ? 'ok' : this.stateMessage(state),
        checkedAt: new Date().toISOString(),
      };
    } catch (e) {
      return {
        state: 'error',
        mode: this.mode,
        latencyMs: Date.now() - started,
        message: (e as Error).message,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  /** Hook para que las subclases decidan el estado; por defecto 'operational'. */
  protected async checkHealth(): Promise<AdapterState> {
    return 'operational';
  }

  async execute<T = unknown>(
    operation: string,
    args: Record<string, unknown>,
    ctx: AdapterCallContext,
  ): Promise<AdapterCallResult<T>> {
    const started = Date.now();
    const handlers = this.operationHandlers();
    const handler = handlers[operation];
    if (!handler) {
      return {
        ok: false,
        state: 'error',
        error: `Operación '${operation}' no soportada por ${this.system}`,
        durationMs: Date.now() - started,
        mode: this.mode,
        system: this.system,
        operation,
      };
    }

    try {
      const data = (await handler(args ?? {}, ctx)) as T;
      const state: AdapterState = 'operational';
      this.audit(operation, ctx, state, Date.now() - started);
      return {
        ok: true,
        state,
        data,
        durationMs: Date.now() - started,
        mode: this.mode,
        system: this.system,
        operation,
      };
    } catch (e) {
      const message = (e as Error).message;
      const state: AdapterState = message.includes('pending_credentials')
        ? 'pending_credentials'
        : 'error';
      this.audit(operation, ctx, state, Date.now() - started, message);
      return {
        ok: false,
        state,
        error: message,
        durationMs: Date.now() - started,
        mode: this.mode,
        system: this.system,
        operation,
      };
    }
  }

  private stateMessage(state: AdapterState): string {
    switch (state) {
      case 'pending_credentials':
        return 'Faltan credenciales. Configurar en el panel de integraciones del tenant.';
      case 'unreachable':
        return 'Sistema externo no alcanzable.';
      case 'error':
        return 'Error en el sistema externo.';
      case 'disabled':
        return 'Integración deshabilitada por licencia o feature flag.';
      default:
        return 'ok';
    }
  }

  private audit(
    operation: string,
    ctx: AdapterCallContext,
    state: AdapterState,
    durationMs: number,
    error?: string,
  ): void {
    this.logger.log(
      `audit system=${this.system} mode=${this.mode} op=${operation} tenant=${ctx.tenantId} state=${state} ms=${durationMs}${error ? ' err=' + error : ''}`,
    );
  }
}
