-- Copia de cada archivo del correo de Lista de Empaque y de la respuesta de Oben con la que se armo (5-nov, caso OV 11314:
-- el Excel enviado y lo que Oben devolvio ese dia ya no se podian recuperar para aclarar una diferencia). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS documentos_enviados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number_order_sales INT NOT NULL,
  message_id VARCHAR,
  asunto TEXT,
  destinatarios TEXT,
  clave_reporte VARCHAR(60) NOT NULL,
  archivo VARCHAR NOT NULL,
  content_type VARCHAR NOT NULL,
  bytes INT NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  contenido BYTEA NOT NULL,
  fuente JSONB,
  avisos JSONB NOT NULL DEFAULT '[]'::jsonb,
  simulado BOOLEAN NOT NULL DEFAULT false,
  enviado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documentos_enviados_ov ON documentos_enviados (tenant_id, number_order_sales, enviado_at DESC);

COMMIT;
