import { Injectable } from '@nestjs/common';
import { RealAdapterBase } from '../real-adapter-base';
import { AdapterCapability, AdapterCallContext, BaseAdapterConfig } from '../adapter.types';

export type GenericHttpAuthScheme = 'api_key' | 'bearer' | 'basic' | 'none';

export interface GenericHttpAdapterConfig extends BaseAdapterConfig {
  system: string;
  baseUrl?: string;
  authScheme?: GenericHttpAuthScheme;
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;
  routes?: Record<string, { path: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' }>;
}

/**
 * Adapter Real genérico HTTP. Sirve para VETA / Armstrong / cualquier sistema
 * que exponga REST + API-Key/Bearer/Basic. La configuración por tenant define:
 *   - baseUrl
 *   - authScheme + credenciales
 *   - mapa de operación → { path, method }
 *
 * Ese diccionario `routes` viene de `tenants.integration_config.<system>.routes`
 * lo que permite conectar un cliente nuevo sin recompilar. Cuando llega una API
 * exótica (OAuth1-TBA de NetSuite, gRPC, SOAP, etc.) se implementa como un
 * RealAdapterBase específico — este genérico cubre el 80% de casos REST.
 */
@Injectable()
export class GenericHttpRealAdapter extends RealAdapterBase {
  readonly system: string;

  constructor(private readonly typedConfig: GenericHttpAdapterConfig) {
    super(typedConfig);
    this.system = typedConfig.system;
  }

  capabilities(): AdapterCapability[] {
    const routes = this.typedConfig.routes ?? {};
    return Object.keys(routes).map((operation) => ({
      operation,
      method: routes[operation].method === 'GET' ? 'read' : 'write',
      description: `HTTP ${routes[operation].method} ${routes[operation].path}`,
    }));
  }

  protected requiredConfigFields(): string[] {
    const scheme = this.typedConfig.authScheme ?? 'none';
    const fields = ['baseUrl'];
    if (scheme === 'api_key') fields.push('apiKey');
    if (scheme === 'bearer') fields.push('bearerToken');
    if (scheme === 'basic') fields.push('basicUser', 'basicPass');
    return fields;
  }

  protected operationHandlers() {
    const routes = this.typedConfig.routes ?? {};
    const handlers: Record<string, (args: Record<string, unknown>, ctx: AdapterCallContext) => Promise<unknown>> = {};
    for (const [operation, route] of Object.entries(routes)) {
      handlers[operation] = async (args) => this.callRoute(route, args);
    }
    return handlers;
  }

  private async callRoute(
    route: { path: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' },
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.assertConfigured();
    const base = this.typedConfig.baseUrl!.replace(/\/$/, '');
    const url = `${base}${route.path}`;
    const headers = this.buildAuthHeaders();
    const init: RequestInit =
      route.method === 'GET'
        ? { method: 'GET' }
        : {
            method: route.method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(args),
          };
    return this.httpJson(url, init, route.method === 'GET' ? headers : {});
  }

  private buildAuthHeaders(): Record<string, string> {
    const c = this.typedConfig;
    switch (c.authScheme) {
      case 'api_key':
        return { [c.apiKeyHeader || 'x-api-key']: c.apiKey || '' };
      case 'bearer':
        return { Authorization: `Bearer ${c.bearerToken}` };
      case 'basic':
        return {
          Authorization:
            'Basic ' + Buffer.from(`${c.basicUser}:${c.basicPass}`).toString('base64'),
        };
      default:
        return {};
    }
  }
}
