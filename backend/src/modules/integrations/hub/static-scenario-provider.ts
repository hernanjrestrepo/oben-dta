import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SCENARIO,
  ScenarioConfig,
  ScenarioProvider,
} from './scenario.types';

/**
 * Proveedor de escenarios sin persistencia. Devuelve happy_path para todo.
 * Es la implementación por defecto — el Bloque 4 sustituye la registración
 * de este símbolo por un proveedor persistente que lee `mock_scenarios` de BD.
 */
@Injectable()
export class StaticScenarioProvider implements ScenarioProvider {
  async resolve(
    _tenantId: string,
    _system: string,
    _operation: string,
  ): Promise<ScenarioConfig> {
    return DEFAULT_SCENARIO;
  }
}
