/**
 * Catálogo maestro de tipos de acción soportados por el motor. Igual que
 * `BUSINESS_EVENTS`, es deliberadamente más amplio que lo implementado hoy —
 * declara el roadmap completo para que agregar un flujo nuevo no obligue a
 * tocar este archivo cada vez.
 *
 * "Implementado" = tiene un `ActionExecutor` real registrado en
 * `ActionExecutorRegistry` (ver ADR-DocumentFlowEngine.md). Los demás están
 * reservados: si una `DocumentFlowRule` los referencia antes de tener
 * ejecutor, el motor lo reporta como acción fallida ("no registrado"), nunca
 * falla en silencio ni inventa un resultado.
 */
export const ACTION_TYPES = [
  'send_email', // implementado — SendEmailAction (Fase 1/2)
  'send_whatsapp', // reservado — Flujo Navieras / notificaciones
  'create_order', // reservado — Flujo Órdenes de Compra
  'update_erp', // reservado — Oracle/Oben ERP real (Capa 2)
  'create_invoice', // reservado — Flujo COMEX / Facturación
  'attach_external_document', // reservado — ej. factura DIAN del proveedor de Oben
  'update_freight_matrix', // reservado — Flujo Navieras
  'notify_user', // reservado — notificación in-app, no email
  'execute_integration', // reservado — invocar Integration Hub genérico como acción
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];
