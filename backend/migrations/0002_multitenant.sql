-- Migración multi-tenant idempotente.
-- Efecto: crea la tabla tenants, siembra el tenant "oben", propaga tenant_id a todas las
-- entidades de negocio y sustituye los uniques globales por uniques compuestos (tenant_id, X).
-- Puede ejecutarse repetidas veces sin causar cambios ni errores.

BEGIN;

-- ============================================================================
-- 1) Tabla tenants
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  tax_id VARCHAR(64),
  country_code VARCHAR(8) NOT NULL DEFAULT 'CO',
  default_currency VARCHAR(8) NOT NULL DEFAULT 'COP',
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Bogota',
  status VARCHAR(16) NOT NULL DEFAULT 'trial',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  integration_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- TypeORM usará camelCase por defecto para las columnas del entity que NO tienen 'name:'.
-- Renombramos si venimos de una versión previa con camelCase.
-- (No hace nada si las columnas snake_case ya existen.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='legalName') THEN
    ALTER TABLE tenants RENAME COLUMN "legalName" TO legal_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='taxId') THEN
    ALTER TABLE tenants RENAME COLUMN "taxId" TO tax_id;
  END IF;
END$$;

INSERT INTO tenants (slug, name, legal_name, country_code, default_currency, timezone, status)
VALUES ('oben', 'Oben Group', 'Oben Group', 'CO', 'COP', 'America/Bogota', 'active')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 2) Función helper para agregar tenant_id + backfill + NOT NULL a una tabla
--    Sustituye el unique(col) por unique(tenant_id, col) si se pasa un unique_col.
-- ============================================================================

DO $$
DECLARE
  oben_id UUID;
  tbl TEXT;
  ucol TEXT;
  legacy_uniq TEXT;
  new_uniq TEXT;
  pair RECORD;
BEGIN
  SELECT id INTO oben_id FROM tenants WHERE slug='oben';

  FOR pair IN
    SELECT * FROM (VALUES
      ('clients',                 'clientId',              'uq_clients_tenant_client_id'),
      ('products',                'sku',                   'uq_products_tenant_sku'),
      ('orders',                  'orderNumber',           'uq_orders_tenant_number'),
      ('order_items',             NULL,                    NULL),
      ('invoices',                'invoiceNumber',         'uq_invoices_tenant_number'),
      ('quotes',                  'quoteNumber',           'uq_quotes_tenant_number'),
      ('quote_items',             NULL,                    NULL),
      ('credit_validations',      'validationNumber',      'uq_credit_validations_tenant_number'),
      ('export_operations',       'exportNumber',          'uq_export_ops_tenant_number'),
      ('export_cost_sheets',      'costSheetNumber',       'uq_export_cost_sheets_tenant_number'),
      ('freight_quotes',          'quoteNumber',           'uq_freight_quotes_tenant_number'),
      ('insurance_quotes',        'quoteNumber',           'uq_insurance_quotes_tenant_number'),
      ('master_packing_lists',    'masterPackingListNumber','uq_master_packing_lists_tenant_number'),
      ('material_consumption',    'consumptionNumber',     'uq_material_consumption_tenant_number'),
      ('notifications',           NULL,                    NULL),
      ('packaging_consumptions',  'consumptionNumber',     'uq_packaging_consumption_tenant_number'),
      ('packing_lists',           'packingListNumber',     'uq_packing_lists_tenant_number'),
      ('production_orders',       'productionOrderNumber', 'uq_production_orders_tenant_number'),
      ('raw_material_consumptions','consumptionNumber',    'uq_raw_material_consumption_tenant_number'),
      ('shipments',               'shipmentNumber',        'uq_shipments_tenant_number'),
      ('shipment_tracking',       NULL,                    NULL),
      ('workflow_events',         NULL,                    NULL)
    ) AS t(tbl, ucol, new_uniq)
  LOOP
    tbl := pair.tbl;
    ucol := pair.ucol;
    new_uniq := pair.new_uniq;

    -- Salta si la tabla no existe (entidad aún no creada por synchronize).
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
      CONTINUE;
    END IF;

    -- 1. Agregar columna tenant_id si falta.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = tbl AND column_name = 'tenant_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN tenant_id UUID', tbl);
    END IF;

    -- 2. Backfill al tenant "oben" para filas existentes.
    EXECUTE format('UPDATE %I SET tenant_id = $1 WHERE tenant_id IS NULL', tbl) USING oben_id;

    -- 3. NOT NULL si todavía es nullable.
    EXECUTE format($f$
      DO $inner$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='%s' AND column_name='tenant_id' AND is_nullable='YES'
        ) THEN
          ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL;
        END IF;
      END $inner$;
    $f$, tbl, tbl);

    -- 4. Índice de tenant_id.
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_tenant_id ON %I(tenant_id)', tbl, tbl);

    -- 5. Drop del unique global sobre ucol (si existe) y creación del unique compuesto (tenant_id, ucol).
    IF ucol IS NOT NULL THEN
      -- Nombre del constraint TypeORM del unique simple (heurística): buscamos por definición.
      FOR legacy_uniq IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = tbl
          AND c.contype = 'u'
          AND array_length(c.conkey, 1) = 1
          AND (SELECT attname FROM pg_attribute WHERE attrelid = c.conrelid AND attnum = c.conkey[1]) = ucol
      LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', tbl, legacy_uniq);
      END LOOP;

      -- Crear unique compuesto si no existe.
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = new_uniq
      ) THEN
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (tenant_id, %I)', tbl, new_uniq, ucol);
      END IF;
    END IF;
  END LOOP;
END$$;

-- ============================================================================
-- 3) USERS: agregar tenant_id (nullable) + is_super_admin + drop unique email global
-- ============================================================================

DO $$
DECLARE
  oben_id UUID;
  legacy_uniq TEXT;
BEGIN
  SELECT id INTO oben_id FROM tenants WHERE slug='oben';

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='tenant_id'
    ) THEN
      ALTER TABLE users ADD COLUMN tenant_id UUID;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_super_admin'
    ) THEN
      ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT false;
    END IF;

    -- Backfill: todo user existente pasa al tenant "oben".
    UPDATE users SET tenant_id = oben_id WHERE tenant_id IS NULL AND is_super_admin = false;

    -- Índice tenant_id.
    CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

    -- Drop del unique global de email y creación del unique (tenant_id, email).
    FOR legacy_uniq IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'users'
        AND c.contype = 'u'
        AND array_length(c.conkey, 1) = 1
        AND (SELECT attname FROM pg_attribute WHERE attrelid = c.conrelid AND attnum = c.conkey[1]) = 'email'
    LOOP
      EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', legacy_uniq);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_tenant_email') THEN
      ALTER TABLE users ADD CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email);
    END IF;
  END IF;
END$$;

-- ============================================================================
-- 4) AUDIT_EVENTS: tenant_id nullable + índice
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_events') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name='audit_events' AND column_name='tenant_id'
    ) THEN
      ALTER TABLE audit_events ADD COLUMN tenant_id UUID;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_id ON audit_events(tenant_id);
  END IF;
END$$;

-- ============================================================================
-- 5) ADAN (documents, document_chunks, embeddings): tenant_id NOT NULL + backfill
-- ============================================================================

DO $$
DECLARE
  oben_id UUID;
BEGIN
  SELECT id INTO oben_id FROM tenants WHERE slug='oben';

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='tenant_id'
    ) THEN
      ALTER TABLE documents ADD COLUMN tenant_id UUID;
    END IF;
    UPDATE documents SET tenant_id = oben_id WHERE tenant_id IS NULL;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='documents' AND column_name='tenant_id' AND is_nullable='YES'
    ) THEN
      ALTER TABLE documents ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);
  END IF;
END$$;

COMMIT;
