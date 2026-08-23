import { DocumentFlowAction, DocumentFlowRecipient } from '../../entities/document-flow-rule.entity';
import { DocumentFlowContext } from './document-flow-context.types';
import { ResolvedDocument } from './document-source.types';
import type { ActionType } from './action-type.types';

export interface ActionExecutionRequest {
  action: DocumentFlowAction;
  context: DocumentFlowContext;
  /** Solo documentos en estado "ready" — el motor filtra antes de llamar. */
  documents: ResolvedDocument[];
  recipients: DocumentFlowRecipient[];
}

export type ActionExecutionStatus = 'executed' | 'skipped' | 'failed';

export interface ActionExecutionResult {
  type: ActionType;
  status: ActionExecutionStatus;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Contrato único para cualquier acción disparable por una regla (enviar
 * correo hoy; crear orden, notificar WhatsApp, etc. mañana — ver
 * `ACTION_TYPES` en `action-type.types.ts` para el catálogo completo). El
 * motor despacha por `action.type` contra `ActionExecutorRegistry` — nunca
 * ejecuta lógica de acción él mismo.
 */
export interface ActionExecutor {
  readonly type: ActionType;
  execute(request: ActionExecutionRequest): Promise<ActionExecutionResult>;
}
