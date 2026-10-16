-- Comision aduanera (CustomsCommission) por transportador de la pata 3 del
-- archivo de fletes de octubre, y la escogida por COMEX en la ruta (15-oct).
-- Idempotente.
BEGIN;
ALTER TABLE freight_inland_rates ADD COLUMN IF NOT EXISTS customs_commission NUMERIC(12,2);
ALTER TABLE liquidacion_rutas ADD COLUMN IF NOT EXISTS aduana_id UUID;
COMMIT;
