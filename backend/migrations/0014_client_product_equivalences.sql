-- Homologacion cliente<->producto (Comercial/Customer Service, WO Comercial Oben Xmart).
-- Reemplaza la hoja de calculo que hoy mantiene Alejandra a mano para traducir
-- como nombra cada cliente un material a la referencia interna de Oben.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS client_product_equivalences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  client_id UUID NOT NULL,
  client_code VARCHAR NOT NULL,
  oben_code VARCHAR NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_client_product_equivalence"
  ON client_product_equivalences (tenant_id, client_id, client_code);

CREATE INDEX IF NOT EXISTS idx_client_product_equivalences_client
  ON client_product_equivalences (client_id);

COMMIT;
