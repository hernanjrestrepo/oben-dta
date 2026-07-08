# Auditoría Final DTA — Estado del Sistema

> Fecha: 2026-06-22 · Servidor Oben `10.50.30.10` (`coitsvphap03`).
> Evidencia real capturada por comando (no opiniones). Fuente: `/opt/dta/qa-evidence.txt`.

## Arquitectura actual

```
Navegador ──► Frontend Next.js :3000 ──► Backend NestJS :3004 ──► PostgreSQL+pgvector :5432
                                              │                     Redis :6379
                                              └──► Ollama :11434 (qwen2.5:3b + nomic-embed-text)
```
Todo en Docker salvo Ollama (nativo systemd, 0.0.0.0:11434).

## Componentes desplegados / Servicios activos (evidencia)

| Contenedor | Imagen | Estado |
|---|---|---|
| dta-backend | docker-backend | Up · healthy |
| dta-frontend | docker-frontend | Up |
| dta-redis | redis:7-alpine | Up · healthy |
| dta-postgres | pgvector/pgvector:pg16 | Up · healthy |

## Estado de Docker
4 contenedores corriendo, 3 con healthcheck `healthy`. Docker 29.6.0 + Compose v5.1.4.

## Estado de PostgreSQL
Extensiones: `plpgsql`, `uuid-ossp`, **`vector` (pgvector)**.
Conteos al momento de la auditoría:
```
users=1  clients=2  products=1  orders=1  invoices=1
credit_validations=2  documents=1  document_chunks=4  embeddings=4
```
Health backend: `{"status":"ok","db":"ok"}`.

## Estado de Ollama
`active` (systemd). Modelos: `qwen2.5:3b` (1.9 GB, en uso por EVA/ADÁN),
`nomic-embed-text` (274 MB, embeddings ADÁN), + 7b/8b residuales del benchmark.

## Estado de EVA
Operativo. Pipeline LLM + tool calling + persistencia validado (ver EJECUCION_PRUEBAS.md):
crea órdenes y facturas reales, bloquea por crédito/inexistencia. Modelo `qwen2.5:3b`.

## Estado de ADÁN
Operativo. RAG sobre pgvector: ingesta → chunks → embeddings → recuperación → respuesta
con fuentes. Responde "no hay información" cuando el contexto no cubre la pregunta (no inventa).

## Estado del Centro IA
Desplegado en `/operaciones`. EVA y ADÁN cableados a endpoints reales; KPIs (órdenes,
facturas, documentos) leídos en vivo de la API. Integraciones marcadas como roadmap.

## Estado del Integration Hub
Desplegado. `IntegrationsService` + módulos VETA/NetSuite/Armstrong.
`/integrations/status` → los 3 `configured:false`. Todas las APIs de lectura devuelven
`pendiente_credenciales` (sin inventar datos). Escritura deshabilitada por diseño.

## Veredicto
Núcleo IA (EVA + ADÁN) y plataforma **operativos y desplegados con evidencia**.
Integraciones externas: arquitectura lista, bloqueadas en credenciales de Oben.
Acceso externo público: bloqueado por firewall corporativo (ver REPORTE_CIERRE).
