-- Conector de correo real (IMAP) — WO-018 Sprint 6.
-- Checkpoint de idempotencia + auditoría de enrutamiento por correo real recibido.
-- Idempotente.

BEGIN;

-- "from" es palabra reservada en SQL; se crea/usa citada, igual que TypeORM
-- cita automáticamente todos los identificadores en las consultas que genera
-- para la entidad EmailIntakeMessage (columna `from: string` sin `name:`
-- explícito mapea 1:1 a esta columna citada).
CREATE TABLE IF NOT EXISTS email_intake_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  message_id VARCHAR NOT NULL,
  imap_uid BIGINT NOT NULL,
  folder VARCHAR NOT NULL DEFAULT 'INBOX',
  "from" VARCHAR NOT NULL,
  subject VARCHAR NOT NULL,
  attachment_count INT NOT NULL DEFAULT 0,
  classification_category VARCHAR,
  classification_confidence FLOAT,
  classification_provider VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'processed',
  result_ref VARCHAR,
  error_message TEXT,
  moved_to_folder VARCHAR,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_email_intake_tenant_message"
  ON email_intake_messages (tenant_id, message_id);

CREATE INDEX IF NOT EXISTS idx_email_intake_tenant
  ON email_intake_messages (tenant_id);

COMMIT;
