-- OBEN US, LLC como cliente de Oben Xmart (6-nov-2026, Alejandra Molinares): los pedidos de Estados Unidos triangulados
-- llegan con la orden del cliente final dirigida a OBEN US, y el cliente de la proforma es OBEN US (CodSec_Entity 9995 en
-- OBEN MAS; sus destinos son los clientes finales). No existia en Clientes (el 9995 solo lo usaba el cliente demo de Paradixe),
-- asi que la OC 3019081 de American Packaging quedo sin cliente. Sin dominios autorizados: se reconoce por el contenido. Idempotente.
BEGIN;

INSERT INTO clients (tenant_id, "clientId", name, email, oben_code, "isActive", authorized_domains, final_customer_in_subject, created_by)
SELECT t.id, 'OBEN-9995', 'OBEN US, LLC', '', '9995', true, '{}', false, 'migracion-0042'
FROM tenants t
WHERE t.id = '92384346-002b-45c4-a4bc-924879374b09'
  AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.tenant_id = t.id AND (c."clientId" = 'OBEN-9995' OR c.name ILIKE 'OBEN US%'));

COMMIT;
