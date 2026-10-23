-- Registro crudo de cada llamada a la API de factura de Oben (23-oct): hora exacta, proforma, distribucion, quien
-- la disparo y que respondio Oben. Sirve para cruzar con Oben las facturas vacias / consecutivos danados y para los
-- topes (una llamada por solicitud al dia, maximo diario, freno tras fallos seguidos). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS facturas_llamadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  solicitud_id UUID NOT NULL,
  number_pf VARCHAR(20) NOT NULL,
  numero_distribucion VARCHAR(20) NOT NULL DEFAULT '',
  disparo VARCHAR(40) NOT NULL,
  resultado VARCHAR(20) NOT NULL DEFAULT 'enviada',
  respuesta TEXT,
  duracion_ms INTEGER,
  usuario_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminada_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_facturas_llamadas_tenant_fecha ON facturas_llamadas (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_facturas_llamadas_solicitud ON facturas_llamadas (tenant_id, solicitud_id, created_at DESC);

COMMIT;
