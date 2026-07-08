import { BaseAdapter } from './base-adapter';
import { AdapterMode, AdapterState } from './adapter.types';

/**
 * Base para adapters en modo `real`. Provee:
 *  - assertConfigured() para lanzar `pending_credentials` si falta cualquier
 *    campo esencial de la configuración del tenant.
 *  - Contrato para el HTTP fetch con timeout uniforme.
 *
 * Cada adapter real concreto declara qué campos son requeridos y qué endpoints
 * usa. La configuración se pasa por constructor desde AdapterFactory.
 */
export abstract class RealAdapterBase extends BaseAdapter {
  readonly mode: AdapterMode = 'real';

  protected abstract requiredConfigFields(): string[];

  protected async checkHealth(): Promise<AdapterState> {
    return this.isConfigured() ? 'operational' : 'pending_credentials';
  }

  isConfigured(): boolean {
    const cfg = this.config as unknown as Record<string, unknown>;
    for (const key of this.requiredConfigFields()) {
      const value = cfg[key];
      if (value === undefined || value === null || value === '') return false;
    }
    return true;
  }

  protected assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error(
        'pending_credentials: faltan credenciales o base URL en la configuración del tenant',
      );
    }
  }

  protected async httpJson<T>(
    input: string,
    init: RequestInit = {},
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    this.assertConfigured();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 15000,
    );
    try {
      const res = await fetch(input, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...extraHeaders,
          ...(init.headers as Record<string, string>),
        },
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
      }
      return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
    } finally {
      clearTimeout(timeout);
    }
  }
}
