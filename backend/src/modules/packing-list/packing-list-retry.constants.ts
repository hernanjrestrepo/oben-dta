/** Pedido explícito del usuario 2026-09-14: reintentar cada 10 minutos, hasta 5 veces. */
export const PACKING_LIST_RETRY_INTERVAL_MS = 10 * 60_000;
export const PACKING_LIST_RETRY_MAX_ATTEMPTS = 5;

/** Regla PND (José, reunión 2026-09-23): mientras cartera no libere, se re-verifica y se avisa cada 6 horas. */
export const PACKING_LIST_CARTERA_RECHECK_MS = 6 * 60 * 60_000;
/** Si la fuente REAL de cartera no responde, se vuelve a intentar pronto (sin avisar cada vez). */
export const PACKING_LIST_CARTERA_ERROR_RECHECK_MS = 10 * 60_000;

/**
 * Después de escalar (5 intentos), la orden NO se abandona: Oben suele cargar el consumo de empaque y los costos
 * horas después de aprobar en corte (13/14-oct-2026: 11376, 11277 y 11276 quedaron "escaladas" aunque Oben ya tenía
 * todo). Se sigue verificando cada hora hasta 48 h; en cuanto el paquete está completo sale solo.
 */
export const PACKING_LIST_RETRY_LONG_INTERVAL_MS = 60 * 60_000;
export const PACKING_LIST_RETRY_MAX_AGE_MS = 48 * 60 * 60_000;
