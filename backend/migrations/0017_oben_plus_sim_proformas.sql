-- Estado del SIMULADOR de OBEN MAS (ObenPlusMockAdapter) para las Proformas
-- que crea el flujo Comercial en modo simulado. Nunca contiene datos reales
-- (numeros SIM-95001..., OV simuladas desde 9.000.001).
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS oben_plus_sim_proformas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  number_pf VARCHAR NOT NULL,
  number_order_sales INT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_oben_plus_sim_proforma"
  ON oben_plus_sim_proformas (tenant_id, number_pf);

CREATE INDEX IF NOT EXISTS idx_oben_plus_sim_proformas_ov
  ON oben_plus_sim_proformas (tenant_id, number_order_sales);

COMMIT;
