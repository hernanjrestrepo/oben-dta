-- Cola de reintentos del correo automático "Lista de Empaque" — WO-018.
-- Pedido explícito del usuario 2026-09-14: no enviar el correo hasta tener
-- el paquete completo; reintentar cada 10 minutos hasta 5 veces antes de
-- escalar por correo a José Guzmán / Jorge Restrepo.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS packing_list_pending_retries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  number_order_sales INT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  last_missing JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Parcial (solo mientras status='pending'): evita encolar dos veces la misma
-- orden mientras ya tiene un reintento en curso, sin bloquear una futura
-- fila nueva una vez la anterior ya quedó 'completed'/'escalated'.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_packing_list_retry_pending_tenant_order"
  ON packing_list_pending_retries (tenant_id, number_order_sales)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_packing_list_retry_due
  ON packing_list_pending_retries (status, next_retry_at);

COMMIT;
