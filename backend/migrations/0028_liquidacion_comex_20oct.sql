-- Mejoras de la reunion de pruebas de liquidacion con COMEX (20-oct):
--  1. Lo que COMEX corrige en el encabezado (partidas, puertos, texto junto a
--     la partida en la factura...) se guarda con la aprobacion: antes se perdia
--     al recargar y la factura salia sin esas correcciones.
--  2. Preferencias por cliente: lo que COMEX deja para un cliente (partida NCM,
--     NALADI, nombre del producto junto a la partida) se propone en sus
--     siguientes proformas ("que se vaya creando por cliente").
--  3. Proformas que COMEX ya liquido por fuera: se sacan de la lista de
--     pendientes.
--  4. Cargas del tarifario de fletes desde la pantalla, con HISTORICO (Hernan,
--     20-oct: "hay que guardar historico de los cuadros de tarifas subidos"):
--     cada carga guarda el archivo original tal cual se subio, las tarifas que
--     quedaron cargadas y un respaldo completo de las que reemplazo.
-- Idempotente.
BEGIN;

ALTER TABLE liquidacion_aprobaciones ADD COLUMN IF NOT EXISTS entrada JSONB;

CREATE TABLE IF NOT EXISTS liquidacion_preferencias_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  cliente_clave VARCHAR(255) NOT NULL,
  cliente VARCHAR(255),
  partida_oben VARCHAR(64) NOT NULL DEFAULT '',
  pa_ncm VARCHAR(64),
  pa_naladi VARCHAR(64),
  ncm_descripcion TEXT,
  ncm_con_descripcion BOOLEAN,
  number_pf VARCHAR(20),
  actualizado_por VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_liq_pref_cliente UNIQUE (tenant_id, cliente_clave, partida_oben)
);

CREATE TABLE IF NOT EXISTS liquidacion_descartes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  number_pf VARCHAR(20) NOT NULL,
  motivo TEXT,
  usuario_id UUID,
  usuario_nombre VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_liq_descarte_pf UNIQUE (tenant_id, number_pf)
);

CREATE TABLE IF NOT EXISTS freight_rate_cargas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  archivo VARCHAR(255) NOT NULL,
  contenido BYTEA,
  tamano INTEGER,
  resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
  tarifas JSONB NOT NULL DEFAULT '{}'::jsonb,
  respaldo JSONB NOT NULL DEFAULT '{}'::jsonb,
  usuario_id UUID,
  usuario_nombre VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_freight_rate_cargas_tenant ON freight_rate_cargas (tenant_id, created_at DESC);

COMMIT;
