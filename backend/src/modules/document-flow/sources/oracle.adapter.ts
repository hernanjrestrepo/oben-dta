import { Injectable } from '@nestjs/common';
import { AdapterRegistry } from '../../integrations/hub/adapter-registry';
import { ResilientAdapterExecutor } from '../../integrations/hub/resilient-adapter-executor';
import {
  DocumentRequest,
  DocumentSource,
  ResolvedDocument,
} from '../document-source.types';

/**
 * Fuente "oracle" — Capa 2 (producción): el documento sale de una consulta
 * real a Oracle vía el Integration Hub. Hoy resuelve contra
 * `OracleMockAdapter` porque el tenant no tiene credenciales reales
 * configuradas — el día que Oben las entregue, el Hub cambia de adapter
 * solo, sin tocar esta clase ni el motor.
 *
 * Inyecta `AdapterRegistry` directamente (no `IntegrationHubService`, que
 * depende de `TenantContext` request-scoped) por la misma razón que
 * `SendEmailAction`: mantener `DocumentSourceRegistry` como singleton puro,
 * para que un flujo futuro pueda registrar fuentes nuevas en `onModuleInit()`
 * sin toparse con el mismo problema de scope.
 */
@Injectable()
export class OracleAdapter implements DocumentSource {
  readonly type = 'oracle' as const;

  constructor(
    private readonly adapters: AdapterRegistry,
    private readonly resilientExecutor: ResilientAdapterExecutor,
  ) {}

  async resolve(request: DocumentRequest): Promise<ResolvedDocument> {
    const operation = request.sourceConfig.operation as string | undefined;
    if (!operation) {
      return {
        key: request.key,
        state: 'unavailable',
        message: 'sourceConfig.operation no especificado',
      };
    }
    const args =
      (request.sourceConfig.args as Record<string, unknown>) ?? {};
    const tenantId = request.context.tenantId;
    const adapter = await this.adapters.resolve(tenantId, 'oracle');
    const result = await this.resilientExecutor.execute(adapter, operation, args, {
      tenantId,
      userId: request.context.userId ?? null,
    });
    if (!result.ok) {
      return {
        key: request.key,
        state:
          result.state === 'pending_credentials' ? 'pending' : 'unavailable',
        message: result.error ?? `oracle.${operation} no disponible`,
      };
    }
    return {
      key: request.key,
      state: 'ready',
      filename: `${request.key}.json`,
      mimeType: 'application/json',
      content: Buffer.from(JSON.stringify(result.data ?? {}, null, 2)),
    };
  }
}
