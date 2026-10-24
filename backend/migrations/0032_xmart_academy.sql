-- Xmart Academy (23-oct): progreso por persona y modulo, intentos de quiz (calificados en el servidor) y eventos de
-- uso y friccion (errores por modulo, preguntas falladas, preguntas a MIA, tiempo en cada leccion). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS academy_progreso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  modulo VARCHAR(40) NOT NULL,
  visto_at TIMESTAMPTZ,
  version_vista INTEGER,
  aprobado_at TIMESTAMPTZ,
  version_aprobada INTEGER,
  mejor_puntaje INTEGER,
  intentos INTEGER NOT NULL DEFAULT 0,
  segundos INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_academy_progreso ON academy_progreso (tenant_id, user_id, modulo);

CREATE TABLE IF NOT EXISTS academy_intentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  modulo VARCHAR(40) NOT NULL,
  version INTEGER NOT NULL,
  puntaje INTEGER NOT NULL,
  aprobado BOOLEAN NOT NULL,
  respuestas JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_academy_intentos ON academy_intentos (tenant_id, modulo, created_at DESC);

CREATE TABLE IF NOT EXISTS academy_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID,
  modulo VARCHAR(40),
  tipo VARCHAR(40) NOT NULL,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_academy_eventos_fecha ON academy_eventos (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_academy_eventos_modulo ON academy_eventos (tenant_id, modulo, tipo, created_at DESC);

COMMIT;
