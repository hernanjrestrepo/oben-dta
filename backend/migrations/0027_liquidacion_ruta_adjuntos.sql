-- Soportes (adjuntos) de la justificacion de un cambio de ruta/tarifa de COMEX
-- (pedido de Hernan, 16-oct): cotizacion del forwarder, correo del booking, etc.
-- Idempotente.
BEGIN;
CREATE TABLE IF NOT EXISTS liquidacion_ruta_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ruta_id UUID NOT NULL REFERENCES liquidacion_rutas(id) ON DELETE CASCADE,
  number_pf VARCHAR(20) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  tipo VARCHAR(120) NOT NULL,
  tamano INTEGER NOT NULL,
  contenido BYTEA NOT NULL,
  subido_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_liquidacion_ruta_adjuntos_ruta ON liquidacion_ruta_adjuntos (tenant_id, ruta_id);
COMMIT;
