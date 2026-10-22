-- Proformas en OBEN MAS creadas desde el flujo de casos comerciales (22-oct):
--  - caso_id: el caso comercial (orden de compra) que la creo; una proforma por caso.
--  - orden_venta: numero de la orden de venta que Oben crea al aprobar (la API de crear OV no lo devuelve:
--    se lee del reporte de proformas de Oben).
-- La unicidad por orden de compra solo aplica a las creadas a mano (sin caso): un mismo numero de OC puede
-- repetirse en pruebas del demo. Idempotente.
BEGIN;

ALTER TABLE proformas_oben ADD COLUMN IF NOT EXISTS caso_id UUID;
ALTER TABLE proformas_oben ADD COLUMN IF NOT EXISTS orden_venta INTEGER;
ALTER TABLE proformas_oben DROP CONSTRAINT IF EXISTS uq_proforma_oben_oc;
CREATE UNIQUE INDEX IF NOT EXISTS uq_proforma_oben_caso ON proformas_oben (tenant_id, caso_id) WHERE caso_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_proforma_oben_oc_manual ON proformas_oben (tenant_id, servidor, orden_compra) WHERE caso_id IS NULL;

COMMIT;
