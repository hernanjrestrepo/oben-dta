-- El correo de la orden de compra se guarda como archivo (.eml, con sus adjuntos) para poder abrirlo desde el caso
-- (Hernán, 6-nov-2026). Idempotente.
BEGIN;

ALTER TABLE comercial_cases ADD COLUMN IF NOT EXISTS oc_eml BYTEA;

COMMIT;
