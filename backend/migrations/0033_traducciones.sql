-- Traducciones de textos del servidor (24-oct: Oben Xmart en ingles, portugues y frances). El texto en espanol es la
-- fuente; cada traduccion se hace una vez con el modelo de MIA y queda aqui. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS traducciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idioma VARCHAR(5) NOT NULL,
  hash CHAR(64) NOT NULL,
  origen TEXT NOT NULL,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_traducciones ON traducciones (idioma, hash);

COMMIT;
