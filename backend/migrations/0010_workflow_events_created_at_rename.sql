-- workflow_events.createdAt vs entidad WorkflowEvent.createdAt (name:'created_at')
-- Drift preexistente encontrado en vivo el 2026-08-26 al probar el flujo real
-- de cotizaciones en el servidor remoto: la tabla se creo (via synchronize,
-- en algun momento anterior a que production tuviera synchronize:false) con
-- la columna en camelCase, pero la entidad desde entonces mapea a
-- snake_case. Cualquier INSERT/UPDATE via TypeORM fallaba con
-- "column created_at does not exist" - es decir, CUALQUIER auditoria de
-- workflow_events (usada por practicamente todo el negocio: cotizaciones,
-- ordenes, flujo de PO) estaba rota en produccion. Idempotente.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_events' AND column_name = 'createdAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_events' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE workflow_events RENAME COLUMN "createdAt" TO created_at;
  END IF;
END $$;

COMMIT;
