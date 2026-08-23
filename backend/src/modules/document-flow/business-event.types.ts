/**
 * Catálogo maestro de eventos de negocio que puede disparar el Motor de
 * Orquestación Documental. Deliberadamente más amplio que lo implementado
 * hoy — incluye el roadmap completo (Cotizaciones, Órdenes de Compra, COMEX,
 * Navieras, Clientes, Cartera, Facturación) para que la aparición de un
 * proceso nuevo sea, en el caso normal, configurar una `DocumentFlowRule`
 * sobre un evento que ya existe aquí — no tocar este archivo.
 *
 * "Emitido hoy" (ver ADR-DocumentFlowEngine.md § Estado de implementación)
 * = algún flujo real ya llama `DocumentFlowEngine.handle(evento, ...)`. Los
 * demás están reservados: declarar una `DocumentFlowRule` sobre un evento
 * reservado es válido (queda `pending`/inactiva hasta que el flujo que lo
 * emite se construya), pero ninguna regla se disparará hasta entonces.
 */
export const BUSINESS_EVENTS = [
  // Cotizaciones — QUOTE_REQUESTED emitido (Fase 2 / Flujo 1)
  'QUOTE_REQUESTED',
  'QUOTE_GENERATED',
  'QUOTE_SENT',

  // Órdenes de Compra — PURCHASE_ORDER_RECEIVED/CREATED/VALIDATION_FAILED
  // emitidos (Flujo 2 / WO-017). PURCHASE_ORDER_VALIDATED queda reservado
  // (hoy la validación comercial es un paso dentro de la regla de
  // PURCHASE_ORDER_RECEIVED, no un evento propio).
  'PURCHASE_ORDER_RECEIVED',
  'PURCHASE_ORDER_VALIDATED',
  'PURCHASE_ORDER_CREATED',
  'PURCHASE_ORDER_VALIDATION_FAILED',

  // COMEX / Exportación — Flujo 3 (roadmap)
  'PRODUCTION_ORDER_CLOSED',
  'PARTIAL_DISPATCH',
  'EXPORT_SETTLED',
  'EXPORT_DOCUMENT_COMPLETED',
  'INVOICE_ATTACHED',

  // Navieras / Logística — Flujo 4 (roadmap)
  'CARRIER_EMAIL_RECEIVED',
  'FREIGHT_MATRIX_UPDATED',

  // Clientes y Cartera — transversal (roadmap)
  'CUSTOMER_CREATED',
  'CUSTOMER_UPDATED',
  'CREDIT_APPROVED',
  'CREDIT_REJECTED',
] as const;

export type BusinessEvent = (typeof BUSINESS_EVENTS)[number];
