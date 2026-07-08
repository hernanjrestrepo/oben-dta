import { BaseAdapter } from './base-adapter';
import { AdapterCallContext, AdapterMode, BaseAdapterConfig } from './adapter.types';
import { applyScenario, NotFoundSignal } from './scenario-runtime';
import { DEFAULT_SCENARIO, ScenarioProvider } from './scenario.types';

/**
 * Base para adapters en modo `mock`. Antes de despachar cada operación consulta
 * al ScenarioProvider (que puede ser el estático por defecto o el persistente
 * del Bloque 4) y aplica el comportamiento configurado.
 *
 * Los mocks NO son datos ficticios en la lógica de negocio: viven aquí en el
 * borde del sistema, son intercambiables por Real vía DI, y quedan operativos
 * como parte permanente del producto para pruebas/QA/demos/entrenamiento.
 */
export abstract class MockAdapterBase extends BaseAdapter {
  readonly mode: AdapterMode = 'mock';

  constructor(
    config: BaseAdapterConfig = {},
    protected readonly scenarios: ScenarioProvider,
  ) {
    super(config);
  }

  protected async withScenario<T>(
    tenantId: string,
    operation: string,
    happyPath: () => Promise<T> | T,
  ): Promise<T> {
    const scenario = await this.scenarios
      .resolve(tenantId, this.system, operation)
      .catch(() => DEFAULT_SCENARIO);
    try {
      await applyScenario(scenario);
    } catch (e) {
      if (e instanceof NotFoundSignal) {
        // El caller responde con datos vacíos/null en vez de error.
        return (undefined as unknown) as T;
      }
      throw e;
    }
    return happyPath();
  }

  protected wrap(
    handler: (args: Record<string, unknown>, ctx: AdapterCallContext) => Promise<unknown> | unknown,
    operation: string,
  ) {
    return async (args: Record<string, unknown>, ctx: AdapterCallContext) => {
      return this.withScenario(ctx.tenantId, operation, () => handler(args, ctx));
    };
  }
}
