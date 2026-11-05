-- OBS. ETIQUETA de la proforma por cliente (documento de especificaciones de Oben, 5-nov-2026; Alejandra Molinares):
-- Microplast y Agraf piden en ese campo, por cada referencia, el codigo del item de su orden de compra
-- ("Codigo ID" y "Item" respectivamente); la lista puede crecer con el mercado de exportacion. origen = 'codigo_item'.
-- Los demas clientes siguen como hasta ahora. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS client_obs_etiqueta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cod_sec_entity INT NOT NULL,
  cliente VARCHAR,
  origen VARCHAR(30) NOT NULL DEFAULT 'codigo_item',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_client_obs_etiqueta UNIQUE (tenant_id, cod_sec_entity)
);

INSERT INTO client_obs_etiqueta (tenant_id, cod_sec_entity, cliente, origen)
SELECT t.id, v.entidad, v.cliente, 'codigo_item'
FROM tenants t
CROSS JOIN (VALUES
  (10121, 'MICROPLAST ANTONIO PALACIO & COMPAÑIA S.A.S'),
  (10175, 'AGRAF INDUSTRIAL S.A.S')
) AS v(entidad, cliente)
WHERE t.id = '92384346-002b-45c4-a4bc-924879374b09'
ON CONFLICT (tenant_id, cod_sec_entity) DO NOTHING;

COMMIT;
