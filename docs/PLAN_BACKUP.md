# Plan de Backup y Recuperación — DTA Oben

> Validado en `10.50.30.10` el 2026-06-22 (restore probado en BD temporal, datos coincidentes).

## Qué se respalda

| Activo | Qué incluye | Método |
|---|---|---|
| PostgreSQL | órdenes, facturas, clientes, productos, validaciones, **documentos+chunks+embeddings (pgvector)** | `pg_dump` |
| Documentos fuente | archivos originales ingeridos (`/knowledge/**`) | copia de carpeta |
| Configuración | `docker/.env`, `docker-compose*.yml`, migraciones | copia de archivos |
| Ollama | modelos descargados | `~/.ollama/models` (o re-`ollama pull`) |

## Backup PostgreSQL (validado)
```bash
TS=$(date +%Y%m%d_%H%M)
docker exec dta-postgres pg_dump -U dta -d dta_db > ~/dta-backups/dta_db_$TS.sql
```
Evidencia: backup de 222 KB generado correctamente. El dump incluye los vectores
(columna `vector(768)`), confirmado al restaurar `embeddings=4`.

## Restauración (validada)
```bash
docker exec dta-postgres psql -U dta -d postgres -c 'CREATE DATABASE dta_restore;'
cat ~/dta-backups/dta_db_<TS>.sql | docker exec -i dta-postgres psql -U dta -d dta_restore
# verificar y, si OK, promover (renombrar) o restaurar sobre dta_db con servicios detenidos
```
**Resultado de la prueba:** restore en `dta_restore_test` → orders=3, invoices=2,
embeddings=4, idénticos al original. BD de prueba eliminada tras validar.

## Backup de documentos y configuración
```bash
tar -czf ~/dta-backups/knowledge_$TS.tar.gz ~/dta/knowledge
cp ~/dta/docker/.env ~/dta-backups/env_$TS.bak
```

## Backup Ollama
Los modelos son reproducibles: `ollama pull qwen2.5:3b && ollama pull nomic-embed-text`.
Para respaldo offline: `tar -czf ollama_models.tar.gz /usr/share/ollama/.ollama/models`.

## Frecuencia recomendada
- PostgreSQL: diario (cron) + antes de cada despliegue.
- Documentos/config: ante cada cambio.
- Retención sugerida: 7 diarios + 4 semanales.

## Cron sugerido (no activado aún)
```
0 2 * * * docker exec dta-postgres pg_dump -U dta -d dta_db > /home/paradixexyz/dta-backups/dta_db_$(date +\%Y\%m\%d).sql
```
