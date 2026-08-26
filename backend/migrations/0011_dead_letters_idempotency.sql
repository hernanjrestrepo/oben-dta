-- Dos tablas que solo existian localmente (synchronize) y nunca tuvieron
-- migracion real: `integration_dead_letters` (usada por
-- ResilientAdapterExecutor.execute() al agotar reintentos - ver
-- resilient-adapter-executor.ts, el INSERT no esta envuelto en try/catch,
-- asi que sin esta tabla cualquier falla transitoria real de una API externa
-- terminaba en una excepcion no controlada en vez de un error limpio) e
-- `idempotency_records` (deduplicacion por Message-ID). Encontrado en vivo
-- el 2026-08-26 corriendo el SchemaBuilder de TypeORM en modo diagnostico
-- (log, sin ejecutar) contra el servidor remoto - el DDL de abajo es
-- exactamente el que TypeORM genero desde las entidades reales
-- (IntegrationDeadLetter, IdempotencyRecord), no escrito a mano.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS integration_dead_letters (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  system VARCHAR(64) NOT NULL,
  operation VARCHAR NOT NULL,
  args JSONB NOT NULL,
  error TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  circuit_open BOOLEAN NOT NULL DEFAULT false,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_595c6a27c73beb7642bc6ccfbb8" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_integration_dead_letters_tenant
  ON integration_dead_letters (tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_dead_letters_system
  ON integration_dead_letters (system);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'idempotency_records_status_enum') THEN
    CREATE TYPE idempotency_records_status_enum AS ENUM ('processing', 'completed', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS idempotency_records (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  key VARCHAR(128) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  status idempotency_records_status_enum NOT NULL DEFAULT 'processing',
  result JSONB,
  error TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_idempotency_tenant_key UNIQUE (tenant_id, key),
  CONSTRAINT "PK_9ae4e93699362b0d4e3da3dd1c2" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_records_tenant
  ON idempotency_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_records_expires_at
  ON idempotency_records (expires_at);

COMMIT;
