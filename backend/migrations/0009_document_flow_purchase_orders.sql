-- Motor de orquestacion documental (DocumentFlowEngine) + Flujo 2 (Ordenes
-- de Compra, WO-017). Estas tablas y columnas solo existian localmente
-- porque alli TypeORM `synchronize` esta activo (NODE_ENV != production);
-- en produccion (`synchronize:false`, fix de seguridad de RC1 Sprint 5)
-- nunca se creo nada de esto porque nunca se escribio esta migracion.
-- Encontrado en vivo el 2026-08-26 al desplegar el Flujo 2 al servidor real.
-- Idempotente.

BEGIN;

-- Agregadas a `quotes` para el ciclo cotizacion -> orden -> factura y para
-- el validador "cotizacion vigente" de WO-017 (antes no existia el
-- concepto de vencimiento de cotizacion).
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS "orderId" UUID;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS "orderNumber" TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS "invoiceId" UUID;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS "validUntil" TIMESTAMPTZ;

-- status como VARCHAR+CHECK en vez de enum nativo de Postgres: mismo criterio
-- ya usado en email_intake_messages.status — evita el manejo de ALTER TYPE
-- para agregar valores futuros, y TypeORM con synchronize:false no valida el
-- tipo fisico de la columna, solo lee/escribe el string.
CREATE TABLE IF NOT EXISTS document_flow_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_event VARCHAR(64) NOT NULL,
  required_documents JSONB NOT NULL DEFAULT '[]',
  recipients JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  integrations JSONB NOT NULL DEFAULT '[]',
  validations JSONB NOT NULL DEFAULT '[]',
  priority INT NOT NULL DEFAULT 0,
  status VARCHAR NOT NULL DEFAULT 'draft'
    CHECK (status IN ('active', 'inactive', 'draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_flow_rules_tenant
  ON document_flow_rules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_flow_rules_trigger_event
  ON document_flow_rules (trigger_event);

CREATE TABLE IF NOT EXISTS purchase_order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  po_number VARCHAR,
  client_id UUID,
  sender_email VARCHAR NOT NULL,
  sender_domain VARCHAR NOT NULL,
  po_date TIMESTAMPTZ,
  reference VARCHAR,
  items JSONB NOT NULL DEFAULT '[]',
  payment_terms VARCHAR,
  incoterm VARCHAR,
  observations TEXT,
  contact_person VARCHAR,
  related_quote_id UUID,
  status VARCHAR NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'order_created', 'validation_failed')),
  created_order_id UUID,
  validation_results JSONB,
  classification JSONB,
  raw_email_body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_documents_tenant
  ON purchase_order_documents (tenant_id);

COMMIT;
