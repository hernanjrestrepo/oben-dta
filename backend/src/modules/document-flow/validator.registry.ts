import { Injectable } from '@nestjs/common';
import { Validator } from './validator.types';

/**
 * Registro de validadores por `type`. A diferencia de
 * `DocumentSourceRegistry`/`ActionExecutorRegistry` (que fijan sus
 * implementaciones genéricas por DI en `DocumentFlowModule`), los
 * validadores son inherentemente específicos de cada flujo de negocio
 * (ej. "cliente existente" solo tiene sentido si el módulo conoce `Client`)
 * — por eso se registran en runtime, igual que `GeneratedDocumentAdapter`,
 * desde el propio módulo de negocio (`OnModuleInit`), nunca desde aquí.
 *
 * Importante: el provider que hace `register()` en su `onModuleInit()` NO
 * puede depender, ni transitivamente, de nada request-scoped (ej.
 * `TenantContext`/`OrdersService`) — un provider request-scoped nunca
 * dispara `onModuleInit()` en el arranque porque no existe un "request"
 * todavía, así que el registro simplemente nunca ocurriría. Ver
 * `CreateOrderAction` para el patrón correcto (repos inyectados
 * directamente, `tenantId` tomado de `DocumentFlowContext` en `execute()`).
 */
@Injectable()
export class ValidatorRegistry {
  private readonly validators = new Map<string, Validator>();

  register(type: string, validator: Validator): void {
    this.validators.set(type, validator);
  }

  resolve(type: string): Validator | undefined {
    return this.validators.get(type);
  }
}
