/** Pedido explícito del usuario 2026-09-14: reintentar cada 10 minutos, hasta 5 veces. */
export const PACKING_LIST_RETRY_INTERVAL_MS = 10 * 60_000;
export const PACKING_LIST_RETRY_MAX_ATTEMPTS = 5;

/** Regla PND (José, reunión 2026-09-23): mientras cartera no libere, se re-verifica y se avisa cada 6 horas. */
export const PACKING_LIST_CARTERA_RECHECK_MS = 6 * 60 * 60_000;
/** Si la fuente REAL de cartera no responde, se vuelve a intentar pronto (sin avisar cada vez). */
export const PACKING_LIST_CARTERA_ERROR_RECHECK_MS = 10 * 60_000;
