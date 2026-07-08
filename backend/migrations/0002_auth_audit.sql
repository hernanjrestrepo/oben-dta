-- Tabla de auditoría de autorización — append-only, tenant-scoped.
-- No se maneja por TypeORM entity porque la escritura es fire-and-forget desde
-- AuthorizationService y no necesita mapeo de objetos.
BEGIN;

CREATE TABLE IF NOT EXISTS authorization_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  user_id UUID,
  permission_key VARCHAR(128),
  module_key VARCHAR(64),
  route VARCHAR(255),
  method VARCHAR(16),
  ip VARCHAR(64),
  user_agent TEXT,
  granted BOOLEAN NOT NULL,
  denied_reason TEXT,
  request_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_tenant ON authorization_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON authorization_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_permission ON authorization_audit(permission_key);
CREATE INDEX IF NOT EXISTS idx_auth_audit_created ON authorization_audit(created_at);

COMMIT;
