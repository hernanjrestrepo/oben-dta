-- WO-026: cada lista de distribucion tiene duenos (usuarios que pueden
-- editarla y dispararla sin el permiso general de configuracion) y un
-- disparador: 'automatico' (recibe cuando el sistema genera el documento) o
-- 'manual' (solo cuando alguien presiona "Enviar ahora").
-- WO-027: formatos de envio editables (asunto y cuerpo del correo) por
-- documento/reporte. Sin fila = texto por defecto del sistema.
-- Idempotente.

BEGIN;

ALTER TABLE distribution_lists ADD COLUMN IF NOT EXISTS owner_user_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE distribution_lists ADD COLUMN IF NOT EXISTS disparador VARCHAR(16) NOT NULL DEFAULT 'automatico';

CREATE TABLE IF NOT EXISTS formatos_envio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  clave VARCHAR(64) NOT NULL,
  asunto VARCHAR(300) NOT NULL,
  cuerpo TEXT NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_formatos_envio_tenant_clave UNIQUE (tenant_id, clave)
);
CREATE INDEX IF NOT EXISTS idx_formatos_envio_tenant ON formatos_envio (tenant_id);

COMMIT;
