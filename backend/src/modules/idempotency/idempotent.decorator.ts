import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_EVENT_KEY = 'idempotency:event_type';
export const IDEMPOTENT_TTL_KEY = 'idempotency:ttl_ms';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h — ventana típica de reenvío de un correo

/**
 * Marca un endpoint de intake de correo como idempotente. `IdempotencyInterceptor`
 * lee `req.body.{messageId,from,subject,body,attachments}` — cualquier
 * controlador de intake (Cotizaciones, Órdenes de Compra, y a futuro
 * COMEX/Navieras) solo necesita este decorador + el interceptor global, sin
 * reimplementar nada.
 */
export const Idempotent = (eventType: string, ttlMs: number = DEFAULT_TTL_MS) => {
  return (target: object, key?: string, descriptor?: PropertyDescriptor) => {
    SetMetadata(IDEMPOTENT_EVENT_KEY, eventType)(target, key!, descriptor!);
    SetMetadata(IDEMPOTENT_TTL_KEY, ttlMs)(target, key!, descriptor!);
  };
};
