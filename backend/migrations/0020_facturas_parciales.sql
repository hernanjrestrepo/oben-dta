-- WO-023: solicitudes de factura parcial. Llegan por correo al buzon de
-- pedidos (asunto "Proforma <PF> - Facturar Parcial", cuerpo "Numero de
-- Proforma: <PF> - Numero de Distribucion: <N>") o se digitan en pantalla.
-- Una proforma + numero de distribucion se factura UNA sola vez.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS facturas_parciales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  number_pf VARCHAR(20) NOT NULL,
  numero_distribucion VARCHAR(20) NOT NULL,
  origen VARCHAR(16) NOT NULL,
  message_id VARCHAR,
  remitente VARCHAR,
  estado VARCHAR(16) NOT NULL DEFAULT 'pendiente',
  respuesta JSONB,
  error TEXT,
  modo VARCHAR(8),
  solicitado_por UUID,
  facturado_por UUID,
  facturada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_facturas_parciales_pf_dist UNIQUE (tenant_id, number_pf, numero_distribucion)
);
CREATE INDEX IF NOT EXISTS idx_facturas_parciales_tenant ON facturas_parciales (tenant_id, created_at DESC);

COMMIT;
