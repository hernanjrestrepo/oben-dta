/**
 * Contexto desacoplado que viaja con cada evento de negocio hacia el motor.
 * Compartido por todos los procesos (cotización, PO, COMEX, navieras, ...) —
 * cada uno llena solo las referencias que le apliquen.
 */
export interface DocumentFlowContext {
  tenantId: string;
  userId?: string | null;
  order?: { id: string; [key: string]: unknown } | null;
  client?: { id: string; [key: string]: unknown } | null;
  quote?: { id: string; [key: string]: unknown } | null;
  exportOperation?: { id: string; [key: string]: unknown } | null;
  metadata?: Record<string, unknown>;
}
