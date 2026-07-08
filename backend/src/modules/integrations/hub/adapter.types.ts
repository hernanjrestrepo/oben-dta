/**
 * Contratos comunes del Integration Hub — parte reusable de la plataforma SaaS.
 * Cada adapter implementa IntegrationAdapter<T> y declara sus capacidades.
 *
 * Modo Real vs Mock: se resuelve por `AdapterFactory` según config del tenant.
 * Nunca acoplar código de negocio a implementación concreta; usar solo el hub.
 */

export type AdapterMode = 'real' | 'mock';

export type AdapterState =
  | 'operational'         // configurado, alcanzable, respondiendo
  | 'pending_credentials' // faltan credenciales o base URL
  | 'unreachable'         // configurado pero endpoint no responde
  | 'error'               // configurado y responde con error
  | 'disabled';           // desactivado por licencia o feature flag

export interface AdapterHealth {
  state: AdapterState;
  mode: AdapterMode;
  latencyMs: number | null;
  message: string;
  checkedAt: string;
}

export interface AdapterCapability {
  operation: string;
  method: 'read' | 'write' | 'read_write';
  requiresLicense?: string;
  description: string;
}

export interface AdapterCallContext {
  tenantId: string;
  userId?: string | null;
  requestId?: string | null;
  reason?: string | null;
}

export interface AdapterCallResult<T> {
  ok: boolean;
  state: AdapterState;
  data?: T;
  error?: string;
  durationMs: number;
  mode: AdapterMode;
  system: string;
  operation: string;
}

/**
 * Contrato base de un adapter. TConfig es el tipo de configuración (credenciales,
 * URLs, etc.) validado por el adapter en su construcción.
 */
export interface IntegrationAdapter {
  readonly system: string;
  readonly mode: AdapterMode;

  health(): Promise<AdapterHealth>;
  capabilities(): AdapterCapability[];

  /**
   * Ejecuta una operación por nombre. Cada adapter enumera qué operaciones
   * soporta en capabilities(); llamar a una operación no soportada devuelve error.
   * El motivo por el que expone `execute` genérico es para que el simulador y
   * el motor de workflows puedan invocarlas sin conocer TypeScript signatures.
   */
  execute<T = unknown>(
    operation: string,
    args: Record<string, unknown>,
    ctx: AdapterCallContext,
  ): Promise<AdapterCallResult<T>>;
}

/**
 * Configuración base para cualquier adapter. Cada implementación puede extenderla.
 */
export interface BaseAdapterConfig {
  baseUrl?: string;
  timeoutMs?: number;
  mode?: AdapterMode;
}

/**
 * Sistemas del catálogo — llaves estables usadas por tenant.settings.integrations.
 */
export const INTEGRATION_SYSTEMS = [
  'oracle',
  'oben',
  'cubeiq',
  'dian',
  'efranco',
  'shipping',
  'email',
  'whatsapp',
] as const;
export type IntegrationSystem = (typeof INTEGRATION_SYSTEMS)[number];
