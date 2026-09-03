-- Listas de distribución: grupos de correos (Para/Copia) reutilizables, que
-- se pueden asociar a un tipo de transacción/documento/reporte (ej:
-- entityType='document', entityKey='packing_list') para que el sistema sepa
-- a quién enviar sin que el usuario tenga que escribir el correo cada vez.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS distribution_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR NOT NULL,
  description VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_distribution_lists_tenant ON distribution_lists (tenant_id);

CREATE TABLE IF NOT EXISTS distribution_list_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  distribution_list_id UUID NOT NULL REFERENCES distribution_lists(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL,
  name VARCHAR,
  role VARCHAR(8) NOT NULL DEFAULT 'to', -- 'to' | 'cc' | 'bcc'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_distribution_recipients_list ON distribution_list_recipients (distribution_list_id);
CREATE INDEX IF NOT EXISTS idx_distribution_recipients_tenant ON distribution_list_recipients (tenant_id);

CREATE TABLE IF NOT EXISTS distribution_list_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  distribution_list_id UUID NOT NULL REFERENCES distribution_lists(id) ON DELETE CASCADE,
  entity_type VARCHAR NOT NULL, -- 'document' | 'transaction' | 'report'
  entity_key VARCHAR NOT NULL,  -- ej: 'packing_list', 'invoice', 'quote_international'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_distribution_assoc_list ON distribution_list_associations (distribution_list_id);
CREATE INDEX IF NOT EXISTS idx_distribution_assoc_lookup ON distribution_list_associations (tenant_id, entity_type, entity_key);

COMMIT;
