-- Motor de Licenciamiento Enterprise (Sección 3/4 misión SaaS).
-- Idempotente. Cada tenant tiene un installation_id único (protección contra
-- clonación: una licencia solo es válida para su installation_id) y una
-- licencia firmada criptográficamente (Ed25519, ver LicenseSigningService).

BEGIN;

-- ============================================================================
-- installation_id por tenant. Se genera una sola vez en el provisionamiento
-- y nunca cambia — es el identificador que la licencia firma.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'installation_id'
  ) THEN
    ALTER TABLE tenants ADD COLUMN installation_id UUID;
  END IF;
END$$;

UPDATE tenants SET installation_id = gen_random_uuid() WHERE installation_id IS NULL;

DO $$
BEGIN
  ALTER TABLE tenants ALTER COLUMN installation_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_installation_id ON tenants(installation_id);

-- ============================================================================
-- Licencias comerciales.
-- ============================================================================
CREATE TABLE IF NOT EXISTS licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  installation_id UUID NOT NULL,
  plan_key VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  max_users INT NOT NULL DEFAULT 0,
  max_sites INT NOT NULL DEFAULT 1,
  issued_at TIMESTAMPTZ NOT NULL,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  grace_period_days INT NOT NULL DEFAULT 7,
  offline BOOLEAN NOT NULL DEFAULT false,
  signature TEXT NOT NULL,
  signing_key_id VARCHAR(32) NOT NULL,
  last_renewal_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_licenses_tenant ON licenses(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_licenses_installation ON licenses(installation_id);
CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at);

COMMIT;
