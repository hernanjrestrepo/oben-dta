-- Casos comerciales (reunion Comercial 2026-09-23): una orden de compra de un
-- cliente, de punta a punta — OC recibida -> Proforma en OBEN MAS -> cubicada
-- -> enviada al cliente -> aprobada (OV retenida) -> cartera -> OV activa ->
-- cerrada al despacharse.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS comercial_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  estado VARCHAR NOT NULL DEFAULT 'oc_recibida',
  client_id UUID,
  cliente VARCHAR,
  codigo_cliente_oben VARCHAR,
  cliente_final VARCHAR,
  contacto_email VARCHAR NOT NULL,
  comercial_email VARCHAR,
  oc_numero VARCHAR,
  oc_message_id VARCHAR,
  oc_asunto VARCHAR NOT NULL DEFAULT '',
  oc_recibida_en TIMESTAMPTZ NOT NULL,
  oc_texto TEXT NOT NULL DEFAULT '',
  oc_adjuntos JSONB NOT NULL DEFAULT '[]',
  extraido_por VARCHAR NOT NULL DEFAULT 'reglas',
  tipo VARCHAR,
  pais VARCHAR,
  destino JSONB,
  fecha_requerida VARCHAR,
  lineas JSONB NOT NULL DEFAULT '[]',
  missing JSONB NOT NULL DEFAULT '[]',
  atencion JSONB NOT NULL DEFAULT '[]',
  simulated BOOLEAN NOT NULL DEFAULT false,
  simulated_items JSONB NOT NULL DEFAULT '[]',
  accion_pendiente JSONB,
  number_pf VARCHAR,
  number_order_sales INT,
  hilo_message_ids JSONB NOT NULL DEFAULT '[]',
  seguimiento JSONB NOT NULL DEFAULT '{"tipo":null,"enviados":0,"proximoEn":null,"ultimoEn":null}',
  next_check_at TIMESTAMPTZ,
  fechas JSONB NOT NULL DEFAULT '{}',
  entrega_comprometida VARCHAR,
  entrega_historial JSONB NOT NULL DEFAULT '[]',
  eventos JSONB NOT NULL DEFAULT '[]',
  proforma_firmada BYTEA,
  proforma_firmada_nombre VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comercial_cases_tenant ON comercial_cases (tenant_id);
CREATE INDEX IF NOT EXISTS idx_comercial_cases_estado ON comercial_cases (tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_comercial_cases_due ON comercial_cases (next_check_at) WHERE next_check_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comercial_cases_pf ON comercial_cases (tenant_id, number_pf);
CREATE INDEX IF NOT EXISTS idx_comercial_cases_oc_msg ON comercial_cases (tenant_id, oc_message_id);
CREATE INDEX IF NOT EXISTS idx_comercial_cases_recibida ON comercial_cases (tenant_id, oc_recibida_en);

-- Una misma orden de compra (mismo Message-ID) nunca abre dos casos.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_comercial_case_oc_message"
  ON comercial_cases (tenant_id, oc_message_id) WHERE oc_message_id IS NOT NULL;

COMMIT;
