-- Columna installation_fingerprint en licenses (WO-013 Sprint 5), creada
-- originalmente vía `synchronize` en desarrollo y nunca capturada en una
-- migración — causó un crash real al desactivar synchronize en producción
-- (2026-08-04, despliegue al servidor de Oben). Idempotente.

BEGIN;

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS installation_fingerprint VARCHAR;

COMMIT;
