-- Maestro de tarifas de flete (Inland/Canada/Transload/Recargos de destino) —
-- cargado desde el Excel de tarifas que envía Oben por correo (WO-018).
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS freight_inland_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  country VARCHAR(8) NOT NULL,
  forwarder VARCHAR NOT NULL,
  destination_port VARCHAR NOT NULL,
  state VARCHAR NOT NULL,
  destination_address VARCHAR NOT NULL,
  weight_lbs INT,
  rate_40hc DECIMAL(12,2) NOT NULL,
  transit_time_days INT,
  valid_until DATE,
  source_file VARCHAR NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_freight_inland_tenant ON freight_inland_rates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_freight_inland_country ON freight_inland_rates (country);
CREATE INDEX IF NOT EXISTS idx_freight_inland_state ON freight_inland_rates (state);

CREATE TABLE IF NOT EXISTS freight_transload_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  destination_port VARCHAR,
  delivery_address VARCHAR NOT NULL,
  unit_weight_lbs INT,
  transloading_rate DECIMAL(12,2) NOT NULL,
  transportation_rate DECIMAL(12,2) NOT NULL,
  validity_note VARCHAR,
  source_file VARCHAR NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_freight_transload_tenant ON freight_transload_rates (tenant_id);

CREATE TABLE IF NOT EXISTS freight_destination_surcharges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  country VARCHAR NOT NULL,
  surcharge_name VARCHAR NOT NULL,
  rate_amount DECIMAL(12,4),
  rate_formula VARCHAR,
  source_file VARCHAR NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_freight_surcharge_tenant ON freight_destination_surcharges (tenant_id);
CREATE INDEX IF NOT EXISTS idx_freight_surcharge_country ON freight_destination_surcharges (country);

COMMIT;
