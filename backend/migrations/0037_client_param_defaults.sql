-- Parametrizacion comercial de RESPALDO por cliente (4-nov-2026): cuando Oben no tiene parametrizado el cliente/destino
-- (APICustomerParameterizationParadixe da 400) la proforma toma estos valores. Los ids son los de OBEN MAS
-- (CREDITO 60 DIAS = 6, USD = 1, DDP = 7, ETIQUETA ESTANDAR bobina = 5 / pallet = 1). Si Oben la parametriza, manda la de Oben.
-- Idempotente. Datos dados por Hernan: Castañeda (10183): pago de contado; Bandas de Colombia (10431): credito 60 dias.

BEGIN;

CREATE TABLE IF NOT EXISTS client_param_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  cod_sec_entity INT NOT NULL,
  cliente VARCHAR,
  condicion_id INT,
  condicion VARCHAR,
  moneda_id INT,
  incoterm_id INT,
  incoterm VARCHAR(16),
  etiqueta_bobina_id INT,
  etiqueta_pallet_id INT,
  desde VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_client_param_defaults UNIQUE (tenant_id, cod_sec_entity)
);

INSERT INTO client_param_defaults (tenant_id, cod_sec_entity, cliente, condicion_id, condicion, moneda_id, incoterm_id, incoterm, etiqueta_bobina_id, etiqueta_pallet_id)
SELECT t.id, v.entidad, v.cliente, v.cond_id, v.cond, 1, 7, 'DDP', 5, 1
FROM tenants t
CROSS JOIN (VALUES
  (10431, 'BANDAS DE COLOMBIA S.A.S.', 6, 'CREDITO 60 DIAS'),
  -- Castañeda: el id de "contado" en OBEN MAS aun no se conoce (no hay maestro de condiciones): se completa cuando se tenga.
  (10183, 'CASTAÑEDA HERNANDEZ VICTOR ALFONSO', NULL::int, 'CONTADO')
) AS v(entidad, cliente, cond_id, cond)
WHERE t.id = '92384346-002b-45c4-a4bc-924879374b09'
ON CONFLICT (tenant_id, cod_sec_entity) DO NOTHING;

COMMIT;
