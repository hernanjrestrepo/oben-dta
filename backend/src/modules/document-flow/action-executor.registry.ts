import { Injectable } from '@nestjs/common';
import { ActionExecutor } from './action-executor.types';
import { ActionType } from './action-type.types';
import { SendEmailAction } from './actions/send-email.action';

/**
 * Único punto donde el motor resuelve `action.type -> ActionExecutor`.
 *
 * Las acciones verdaderamente genéricas (ej. `send_email`, que solo conoce
 * el Hub y el contexto desacoplado) se registran fijas por DI en el
 * constructor. Las acciones específicas de un flujo de negocio (ej.
 * `create_order`, que necesita `OrdersService`) se registran en runtime vía
 * `register()` desde el propio módulo de negocio (`OnModuleInit`) — igual
 * patrón que `GeneratedDocumentAdapter`/`ValidatorRegistry`. En ningún caso
 * `DocumentFlowEngine` cambia.
 */
@Injectable()
export class ActionExecutorRegistry {
  private readonly executors = new Map<ActionType, ActionExecutor>();

  constructor(sendEmail: SendEmailAction) {
    this.executors.set(sendEmail.type, sendEmail);
  }

  register(type: ActionType, executor: ActionExecutor): void {
    this.executors.set(type, executor);
  }

  resolve(type: ActionType): ActionExecutor | undefined {
    return this.executors.get(type);
  }
}
