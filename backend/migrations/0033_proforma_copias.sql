-- Copia de la proforma tal como la entrega Oben mientras esta pendiente de liquidar (28-oct, Maria Escobar):
-- spCheckSettlement solo responde mientras la proforma esta pendiente ("Ya se encuentra liquidada" despues), asi que
-- cada vez que el sistema la consulta con exito se guarda aqui para poder mostrar y descargar la proforma siempre. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS proforma_copias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number_pf VARCHAR(20) NOT NULL,
  orden_venta VARCHAR(60),
  campos JSONB NOT NULL,
  detalle JSONB NOT NULL,
  capturada_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_proforma_copias_pf ON proforma_copias (tenant_id, number_pf);

COMMIT;
