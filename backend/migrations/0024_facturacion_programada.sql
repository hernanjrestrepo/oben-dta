-- WO-032: programacion diaria de facturacion. Oben factura lo que Comercial y
-- Despacho programan para cada dia (reunion del 2026-10-08), no todo lo que
-- cierra. Con settings.facturacion.soloProgramadas la facturacion automatica
-- solo factura las ordenes programadas para HOY. Una orden por dia.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS facturacion_programada (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  fecha DATE NOT NULL,
  number_order_sales INT NOT NULL,
  number_pf VARCHAR(20) NOT NULL,
  tipo VARCHAR(10) NOT NULL DEFAULT 'completa',
  estado_oben VARCHAR(40),
  cliente VARCHAR,
  cargada_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_facturacion_programada_dia_ov UNIQUE (tenant_id, fecha, number_order_sales)
);
CREATE INDEX IF NOT EXISTS idx_facturacion_programada_dia ON facturacion_programada (tenant_id, fecha);

COMMIT;
