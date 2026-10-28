-- Registro de uso de IA generativa (28-oct): cada imagen o video que MIA genera, con modelo, costo estimado y real.
-- Sirve para los topes de costo (por pedido, por dia y por mes) y para auditar el gasto. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ia_usos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id UUID,
  tipo VARCHAR(16) NOT NULL,
  modelo VARCHAR(120) NOT NULL,
  nivel VARCHAR(16) NOT NULL DEFAULT 'economico',
  estado VARCHAR(16) NOT NULL DEFAULT 'en_proceso',
  costo_estimado_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  costo_real_usd NUMERIC(10,4),
  trabajo_id VARCHAR(120),
  prompt TEXT,
  detalle JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminado_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_ia_usos_tenant_fecha ON ia_usos (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ia_usos_trabajo ON ia_usos (tenant_id, trabajo_id);

COMMIT;
