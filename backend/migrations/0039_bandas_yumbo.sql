-- Bandas de Colombia (10431): la ciudad de destino es YUMBO, Valle del Cauca (Hernan, 4-nov). CodSec_City 2384 = YUMBO (la 1112
-- "YUMBO-VALLE DEL CAUCA" es el formato viejo; con Bogota Oben usa el nuevo). Puerto = la misma ciudad.
BEGIN;
UPDATE client_param_defaults SET ciudad_id = 2384, ciudad = 'YUMBO', hasta = 'YUMBO - COLOMBIA', updated_at = now()
WHERE cod_sec_entity = 10431 AND tenant_id = '92384346-002b-45c4-a4bc-924879374b09';
COMMIT;
