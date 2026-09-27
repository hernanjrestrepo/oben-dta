-- Regla PND (Producir No Despachar) para la Lista de Empaque — reunion
-- Comercial 2026-09-23 (Jose, 41:00): si cartera no ha liberado la orden, la
-- Lista de Empaque no se genera; la orden queda retenida y se re-verifica
-- cada 6 horas avisando a la lista de distribucion "packing_list_cartera".
-- Reusa la cola de reintentos: una sola fila 'pending' por OV (indice 0013).
-- Idempotente.

BEGIN;

ALTER TABLE packing_list_pending_retries
  ADD COLUMN IF NOT EXISTS kind VARCHAR NOT NULL DEFAULT 'incompleto';

ALTER TABLE packing_list_pending_retries
  ADD COLUMN IF NOT EXISTS hold_reason TEXT;

-- Liberacion manual (un usuario confirma que cartera libero): no se re-verifica.
ALTER TABLE packing_list_pending_retries
  ADD COLUMN IF NOT EXISTS cartera_override BOOLEAN NOT NULL DEFAULT false;

COMMIT;
