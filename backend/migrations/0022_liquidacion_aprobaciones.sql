-- COMEX aprueba la liquidacion antes de enviarse a Oben (decision de Hernan,
-- 2026-10-06). La aprobacion es de UNOS valores concretos (huella del
-- encabezado + lineas): si algo cambia despues, deja de valer. Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS liquidacion_aprobaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  number_pf VARCHAR(20) NOT NULL,
  huella VARCHAR(64) NOT NULL,
  aprobado_por UUID,
  aprobado_por_nombre VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_liquidacion_aprobaciones_pf UNIQUE (tenant_id, number_pf)
);

COMMIT;
