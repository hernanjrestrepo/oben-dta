-- Equivalencias de AGRAF INDUSTRIAL (10175), 6-nov-2026: su orden OCI-00000143 pide "PET L BTE TQ2 12MIC <ancho>" y
-- "PET L MET TQ2 12MIC <ancho>" sin codigo de pelicula de Oben. Tomadas de lo que Oben ya le despacho: OV 10973 = ET---0012RT
-- (PET transparente 12) y OV 10974 / 11389 = EMQ--0012MT (PET metalizado 12). El ancho va aparte en cada linea. Idempotente.
BEGIN;

INSERT INTO client_product_equivalences (tenant_id, client_id, client_code, oben_code, description)
SELECT c.tenant_id, c.id, v.codigo, v.oben, v.descripcion
FROM clients c
CROSS JOIN (VALUES
  ('PET L BTE TQ2 12MIC', 'ET---0012RT', 'PET transparente 12 micras (como en la OV 10973)'),
  ('PET L MET TQ2 12MIC', 'EMQ--0012MT', 'PET metalizado 12 micras (como en las OV 10974 y 11389)')
) AS v(codigo, oben, descripcion)
WHERE c.tenant_id = '92384346-002b-45c4-a4bc-924879374b09' AND c.oben_code = '10175'
ON CONFLICT (tenant_id, client_id, client_code) DO NOTHING;

COMMIT;
