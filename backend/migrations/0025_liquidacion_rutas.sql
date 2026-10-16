-- Cambios de ruta de COMEX sobre la preliquidacion (reunion del 15-oct):
-- COMEX escoge del tarifario el flete maritimo (puerto origen/destino,
-- agente, naviera) y el Inland (transportador terrestre). Cada cambio es un
-- registro numerado (orden de compra interna) con antes/despues, sobrecosto,
-- usuario y motivo opcional. La ruta vigente de una PF es su ultimo registro.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS liquidacion_rutas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero SERIAL,
  tenant_id UUID NOT NULL,
  number_pf VARCHAR(20) NOT NULL,
  maritima_id UUID,
  inland_id UUID,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  motivo TEXT,
  usuario_id UUID,
  usuario_nombre VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_liquidacion_rutas_pf ON liquidacion_rutas (tenant_id, number_pf, created_at DESC);

COMMIT;
