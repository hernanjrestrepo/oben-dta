-- El correo "Cubicación de Proforma #N" de OBEN MAS trae adjunto el PDF de la Proforma que se envía al cliente
-- (José, 29-oct). Se guarda en el caso para enviarlo tal cual, en lugar del PDF del simulador. Idempotente.
BEGIN;

ALTER TABLE comercial_cases ADD COLUMN IF NOT EXISTS proforma_pdf BYTEA;
ALTER TABLE comercial_cases ADD COLUMN IF NOT EXISTS proforma_pdf_nombre VARCHAR;

COMMIT;
