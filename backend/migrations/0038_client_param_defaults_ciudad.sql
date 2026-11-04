-- La parametrizacion de respaldo tambien guarda la ciudad de destino (el maestro de clientes de Oben a veces no trae ciudad
-- en la direccion, p. ej. Bandas de Colombia). Puerto = "no aplica" -> el puerto es la misma ciudad, como en DORFAN.
-- Castañeda: Alejandra ya lo parametrizo en OBEN MAS (CONTADO CONTRA FACTURA = 49): se deja igual aqui como respaldo.
BEGIN;

ALTER TABLE client_param_defaults ADD COLUMN IF NOT EXISTS ciudad_id INT;
ALTER TABLE client_param_defaults ADD COLUMN IF NOT EXISTS ciudad VARCHAR;
ALTER TABLE client_param_defaults ADD COLUMN IF NOT EXISTS hasta VARCHAR;

UPDATE client_param_defaults SET condicion_id = 49, condicion = 'CONTADO CONTRA FACTURA', ciudad_id = 1381, ciudad = 'BOGOTÁ, D.C.', hasta = 'BOGOTA - COLOMBIA', updated_at = now()
WHERE cod_sec_entity = 10183 AND tenant_id = '92384346-002b-45c4-a4bc-924879374b09';

-- Bandas de Colombia: Cl 13 # 27A-158 (Puente Aranda), Bogotá D.C.
UPDATE client_param_defaults SET ciudad_id = 1381, ciudad = 'BOGOTÁ, D.C.', hasta = 'BOGOTA - COLOMBIA', updated_at = now()
WHERE cod_sec_entity = 10431 AND tenant_id = '92384346-002b-45c4-a4bc-924879374b09';

COMMIT;
