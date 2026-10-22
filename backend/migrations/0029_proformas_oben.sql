-- Proformas creadas en OBEN MAS desde Oben Xmart con las APIs comerciales (22-oct; hoy en el servidor de PRUEBAS).
-- Cada fila es una proforma: encabezado, sus lineas de detalle, la orden de venta y la activacion.
--  - numero_pf: numero OFICIAL de la proforma ("Number PF"), con el que Comercial y todos hacen seguimiento.
--  - codigo_interno: CodSec_SalesOrderHeadPF, el codigo interno del encabezado que piden detalle, OV y activacion.
-- `pasos` guarda cada llamada a Oben (que respondio, cuando) para continuar sin repetir lo que ya quedo hecho y
-- para auditoria. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS proformas_oben (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  servidor VARCHAR(20) NOT NULL,
  orden_compra VARCHAR(100) NOT NULL,
  numero_pf VARCHAR(30),
  codigo_interno INTEGER,
  estado VARCHAR(30) NOT NULL DEFAULT 'pendiente',
  cliente VARCHAR(255),
  destino VARCHAR(255),
  entrada JSONB NOT NULL DEFAULT '{}'::jsonb,
  encabezado JSONB NOT NULL DEFAULT '{}'::jsonb,
  lineas JSONB NOT NULL DEFAULT '[]'::jsonb,
  pasos JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  creado_por UUID,
  creado_por_nombre VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_proforma_oben_oc UNIQUE (tenant_id, servidor, orden_compra)
);
CREATE INDEX IF NOT EXISTS idx_proformas_oben_tenant ON proformas_oben (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proformas_oben_pf ON proformas_oben (tenant_id, numero_pf);

COMMIT;
