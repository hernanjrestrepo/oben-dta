-- Maestro de clientes para el flujo Comercial (reunion 2026-09-23):
-- codigo del cliente en OBEN MAS, dominios de correo autorizados (anti-fraude
-- por dominios parecidos), comercial a cargo y clientes intermediarios
-- (ej. Oben US, con el cliente final en el asunto).
-- Idempotente.

BEGIN;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS oben_code VARCHAR;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS authorized_domains TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS comercial_email VARCHAR;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS final_customer_in_subject BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clients_oben_code ON clients (tenant_id, oben_code);
CREATE INDEX IF NOT EXISTS idx_clients_authorized_domains ON clients USING GIN (authorized_domains);

COMMIT;
