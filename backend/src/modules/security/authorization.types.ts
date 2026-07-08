/**
 * Contratos del motor de autorización. Separados en un archivo propio para
 * que futuras extensiones (ABAC policy engine, decision cache, etc.) puedan
 * suscribirse sin acoplar la implementación del servicio.
 */

export type AuthorizationEffect = 'allow' | 'deny';

export interface AuthorizationSubject {
  userId: string;
  tenantId: string | null;
  isSuperAdmin: boolean;
}

export interface AuthorizationRequest {
  subject: AuthorizationSubject;
  permission: string;
  resource?: {
    type?: string;
    id?: string;
    ownerId?: string | null;
    tenantId?: string | null;
    attributes?: Record<string, unknown>;
  };
  context?: {
    route?: string;
    method?: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
    now?: Date;
  };
}

export interface AuthorizationDecision {
  effect: AuthorizationEffect;
  reason: string;
  matchedPolicy?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Contrato de policy que puede sumarse al motor. Cada policy recibe la request
 * y devuelve una decisión (o null si no aplica). El motor las evalúa en orden
 * y aplica el primer resultado no-nulo con precedencia deny-over-allow.
 *
 * Esta es la extensión ABAC futura: agregar policies sin tocar el motor.
 */
export interface AuthorizationPolicy {
  readonly name: string;
  evaluate(request: AuthorizationRequest): Promise<AuthorizationDecision | null>;
}
