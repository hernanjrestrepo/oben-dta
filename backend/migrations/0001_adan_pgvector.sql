-- Migración ADÁN — preparada para Fase 4. NO ejecutada todavía.
--
-- PRE-REQUISITO BLOQUEANTE confirmado en auditoría local (2026-06-22):
--   La imagen actual "postgres:16-alpine" NO trae la extensión pgvector
--   (pg_available_extensions no devuelve 'vector'). Antes de correr esta
--   migración hay que cambiar docker/docker-compose.yml para usar
--   "pgvector/pgvector:pg16" (mismo Postgres 16, con pgvector ya compilado)
--   y recrear el contenedor dta-postgres. Eso NO se hace en esta fase.

CREATE EXTENSION IF NOT EXISTS vector;

-- Documentos fuente cargados (PDF/DOCX/XLSX/TXT/MD)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_name VARCHAR NOT NULL,
  file_type VARCHAR NOT NULL, -- pdf | docx | xlsx | txt | md
  source_path VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'PENDING', -- PENDING | CHUNKED | EMBEDDED | FAILED
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Fragmentos (chunks) de cada documento
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  token_count INT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Embeddings por chunk. Dimensión 768 = nomic-embed-text (modelo de embeddings
-- elegido, liviano y apto para CPU-only). Si se cambia a bge-m3 usar 1024.
CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  embedding VECTOR(768) NOT NULL,
  model_name VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);

-- Índice HNSW para búsqueda semántica (similaridad coseno). Requiere pgvector >= 0.5.
CREATE INDEX IF NOT EXISTS idx_embeddings_vector_hnsw
  ON embeddings USING hnsw (embedding vector_cosine_ops);
