export interface IdempotencyKeyInput {
  /** Message-ID real del correo — máxima prioridad si existe. */
  messageId?: string | null;
  from: string;
  subject: string;
  body: string;
  attachmentNames?: string[];
}

export interface ClaimResult<T = unknown> {
  /** true = esta llamada ganó la reclamación y debe ejecutar el flujo. */
  claimed: boolean;
  /** Solo si claimed=false: qué encontró (para decidir cached vs. duplicado en curso). */
  existingStatus?: 'processing' | 'completed' | 'failed';
  existingResult?: T;
}
