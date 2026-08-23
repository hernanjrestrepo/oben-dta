import { DocumentFlowValidation } from '../../entities/document-flow-rule.entity';
import { DocumentFlowContext } from './document-flow-context.types';

export interface ValidationRequest {
  validation: DocumentFlowValidation;
  context: DocumentFlowContext;
}

export interface ValidationResult {
  type: string;
  passed: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Contrato único para cualquier validación declarada en una
 * `DocumentFlowRule.validations`. Igual que `DocumentSource`/`ActionExecutor`,
 * el motor solo despacha por `validation.type` — nunca conoce qué significa
 * "cliente existente" o "cupo de crédito".
 */
export interface Validator {
  readonly type: string;
  validate(request: ValidationRequest): Promise<ValidationResult>;
}
