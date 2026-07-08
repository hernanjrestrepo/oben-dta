# Manual Técnico — DTA Oben

> Estado actual (2026-06-23), complementa `ARQUITECTURA-REAL.md` (snapshot histórico del
> momento pre-despliegue — ya superado: la app SÍ está desplegada en el servidor de Oben).
> Para variables/endpoints exactos ver `INVENTARIO_VARIABLES_ENV.md` / `INVENTARIO_ENDPOINTS.md`.

## 1. Stack y dónde corre cada pieza (estado actual)
| Componente | Dónde | Detalle |
|---|---|---|
| PostgreSQL | Docker, servidor `10.50.30.10` | imagen `pgvector/pgvector:pg16` (swap desde `postgres:16-alpine` para soportar ADÁN) |
| Redis | Docker, servidor | `redis:7-alpine` |
| Backend NestJS | Docker, servidor | puerto `3004`, build de `backend/` |
| Frontend Next.js | Docker, servidor | puerto `3000`, build de `frontend/` |
| Ollama | nativo (systemd), servidor | `OLLAMA_HOST=0.0.0.0:11434`, alcanzable desde Docker vía `host.docker.internal` (`extra_hosts: host.docker.internal:host-gateway` en compose) |

Acceso al servidor: VPN FortiClient + SSH (`paradixexyz@10.50.30.10`). Acceso web hoy solo vía
túnel SSH (`plink -N -L 3000:localhost:3000 -L 3004:localhost:3004`) — ver `DESPLIEGUE_DEFINITIVO.md`
para el bloqueo de firewall y las opciones para URL pública.

## 2. Backend — módulos (NestJS)
Registrados en `app.module.ts`: `AuthModule, ClientsModule, ProductsModule, OrdersModule,
InvoicesModule, EvaModule, AdanModule, IntegrationsModule, QuotesModule, SeedModule,
DashboardModule` + `AppController`/`HealthController` directos.

Detalle por capa:
- **Auth**: JWT (`JWT_SECRET`), login/registro/refresh/logout, RBAC vía `@Roles` + `JwtAuthGuard`.
- **Clients/Products/Orders/Invoices/Quotes**: CRUD estándar con TypeORM sobre PostgreSQL.
- **EVA** (`modules/ia/`): orquestación NL → LLM (Ollama, tool calling) → persistencia real.
  - `ollama.service.ts`: cliente HTTP a Ollama (`chat`, `embed`, `chatSimple`, `healthCheck`).
  - `tools/eva-tools.service.ts`: implementación real de cada tool (GetClient, GetProduct,
    ValidateCredit, CreateOrder, CreateInvoice + tools de integración read-only).
  - `eva-orchestrator.service.ts`: loop de iteración con tool calling; mecanismo de "nudge"
    (máx. 4) para forzar que el modelo 3b continúe la cadena de tools en vez de narrar texto;
    máx. 12 iteraciones; detección de flujo bloqueado (ej. crédito insuficiente).
- **ADÁN** (`modules/adan/`): RAG.
  - `extractors.ts`: extracción de texto por tipo (PDF/DOCX/XLSX nativo TXT/MD).
  - `adan.service.ts`: chunking → embeddings (`nomic-embed-text`, 768 dim) → pgvector → búsqueda
    semántica (`search()`) → respuesta fundamentada con fuentes citadas (`ask()`).
  - Migración `backend/migrations/0001_adan_pgvector.sql`: tablas `documents`,
    `document_chunks`, `embeddings` (vector(768)) + índice HNSW.
- **Integration Hub** (`modules/integrations/`): arquitectura común
  (`common/integration-client.ts` — clase abstracta con Auth/Client/DTO/Mapper/Logger/Audit).
  - `veta.service.ts`: auth por API key.
  - `netsuite.service.ts`: OAuth 1.0a TBA real (firma HMAC-SHA256, `buildOAuthHeader`/`rfc3986`).
  - `armstrong.service.ts`: auth bearer.
  - Todas **solo lectura**, degradan a `pendiente_credenciales` si falta configuración —
    nunca fabrican datos.

## 3. Frontend (Next.js)
- `frontend/src/lib/api.ts`: cliente Axios único, interceptor JWT + manejo de 401.
- `frontend/src/app/operaciones/page.tsx`: Centro de Operaciones IA — usa `/eva/process` (con
  trazabilidad de tools) y `/adan/ask` (con fuentes citadas); KPIs desde datos reales.
- **Importante para cualquier cambio futuro**: este proyecto usa una versión de Next.js con
  cambios respecto a la documentación de entrenamiento del modelo — revisar
  `node_modules/next/dist/docs/` antes de escribir código nuevo (ver `frontend/AGENTS.md`).

## 4. Decisión de modelo LLM (benchmark real)
Medido en el hardware real del servidor (Xeon Silver 4210, 15GB RAM, sin GPU):

| Modelo | RAM | Velocidad | Calidad |
|---|---|---|---|
| qwen2.5:3b | ~2GB | ~10 tok/s | fiel, no alucina — **ganador** |
| qwen2.5:7b | mayor | más lento | alucinó datos de factura no solicitados |
| llama3.1:8b | mayor | más lento | sin ventaja de calidad sobre 3b al mismo costo de RAM |

Embeddings: `nomic-embed-text` (768 dim), elegido por ser el estándar local liviano compatible
con pgvector sin GPU.

## 5. Seguridad implementada
- JWT + refresh con doble nombre de campo aceptado.
- RBAC por rol (`admin/sales/production/finance`).
- Anti-escalada de privilegios e IDOR cerrados (Sprint Seguridad 0).
- Integration Hub: nunca escribe, nunca fabrica datos ante falta de credenciales.

## 6. Backups
`pg_dump` manual validado con restauración a base temporal (conteos de filas/embeddings
coincidentes). Cron diario documentado en `PLAN_BACKUP.md`, pendiente de activación operativa.

## 7. Limitaciones conocidas (no ocultar)
- Sin URL pública (bloqueo de firewall corporativo, no de código).
- Sin gestión de usuarios vía UI/API (solo registro + edición directa en BD).
- `AIController`/`NotificationController` existen en el código pero no están montados en
  ningún módulo importado por `AppModule` — código muerto, no afecta runtime (ver
  `INVENTARIO_ENDPOINTS.md`).
- Calidad de redacción del modelo 3b puede ser imprecisa en casos límite (ej. producto
  inexistente), sin afectar la lógica de persistencia.

## 8. Referencias
`ARQUITECTURA-REAL.md` (snapshot histórico), `INVENTARIO_ENDPOINTS.md`,
`INVENTARIO_VARIABLES_ENV.md`, `MATRIZ-INTEGRACIONES.md`, `PLAN_BACKUP.md`,
`DESPLIEGUE_DEFINITIVO.md`.
