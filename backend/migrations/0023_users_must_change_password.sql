-- Contraseña temporal: al crear un usuario o restablecer su contraseña desde
-- Usuarios, el usuario queda obligado a cambiarla en su siguiente ingreso
-- (pedido de Hernán, 2026-10-07). Idempotente.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMIT;
