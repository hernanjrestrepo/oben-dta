-- Pata 2 (flete MARITIMO, puerto a puerto o a rampa de destino) del archivo
-- de fletes de Oben ("Fletes Exportacion_Oben Octubre 2026.xlsx", hoja
-- "Update - Freight Leg2"). La liquidacion toma de aqui el Flete total;
-- destination_port usa el mismo formato que freight_inland_rates
-- ("Houston, TX (Port)") para empalmar la pata 2 con la pata 3.
-- Tabla de referencia: se reemplaza completa en cada carga. Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS freight_ocean_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  origin VARCHAR NOT NULL,
  destination VARCHAR NOT NULL,
  destination_port VARCHAR NOT NULL,
  container_type VARCHAR(16) NOT NULL,
  forwarder VARCHAR NOT NULL,
  shipping_line VARCHAR,
  transit_points VARCHAR,
  transit_days INT,
  rate_total NUMERIC(12,2) NOT NULL,
  carrier_destination_charges NUMERIC(12,2),
  is_partial BOOLEAN NOT NULL DEFAULT false,
  effective_date DATE,
  valid_until DATE,
  source_file VARCHAR NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_freight_ocean_tenant ON freight_ocean_rates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_freight_ocean_route ON freight_ocean_rates (tenant_id, destination_port);

COMMIT;
