-- La API de crear orden de venta (APISalesOrderOV) ya devuelve la lista de órdenes que generó, cada una con sus SKU
-- y cantidades (José, 29-oct). Una proforma puede generar varias; `orden_venta` queda con la primera. Idempotente.
BEGIN;

ALTER TABLE proformas_oben ADD COLUMN IF NOT EXISTS ordenes_venta JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
