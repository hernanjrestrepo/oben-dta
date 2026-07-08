# Inventario de Variables de Entorno — DTA Oben

> Extraído por grep directo sobre `backend/src` (`process.env.*`, `configService.get(...)`)
> y `docker/docker-compose.yml`. Solo variables que el código realmente lee. Documento de
> inventario — no se modifica configuración ni código en esta fase.

## Backend

| Variable | Dónde se usa | Default en código | Obligatoria |
|---|---|---|---|
| `NODE_ENV` | `app.module.ts` (TypeORM `synchronize`/`logging`) | — | Sí |
| `PORT` | `main.ts` | `3004` (asumido por compose) | No |
| `FRONTEND_URL` | `main.ts` (CORS) | — | Sí en prod |
| `DB_HOST` | `app.module.ts` | `localhost` | No |
| `DB_PORT` | `app.module.ts` | `5432` | No |
| `DB_USERNAME` | `app.module.ts` | `dta` | No |
| `DB_PASSWORD` | `app.module.ts` | — | Sí |
| `DB_NAME` | `app.module.ts` | `dta_db` | No |
| `JWT_SECRET` | `auth.module.ts`, `auth.service.ts`, `jwt-auth.guard.ts` | — | **Sí — crítica de seguridad** |
| `OLLAMA_URL` | `ia/ollama.service.ts` | `http://localhost:11434` | No (sí en servidor: debe apuntar a `host.docker.internal:11434`) |
| `OLLAMA_MODEL` | `ia/ollama.service.ts` | `qwen2.5:7b-instruct` (placeholder en código) | **Sí en producción — debe ser `qwen2.5:3b`, ganador del benchmark** |
| `OLLAMA_EMBED_MODEL` | `ia/ollama.service.ts` | — | Sí (debe ser `nomic-embed-text`) |
| `VETA_BASE_URL` | `integrations/veta/veta.service.ts` | — | Solo al integrar VETA |
| `VETA_AUTH_SCHEME` | `integrations/veta/veta.service.ts` | `api_key` | No |
| `VETA_API_KEY` | `integrations/veta/veta.service.ts` | — | Solo al integrar VETA |
| `VETA_API_KEY_HEADER` | `integrations/veta/veta.service.ts` | `x-api-key` | No |
| `NETSUITE_ACCOUNT_ID` | `integrations/netsuite/netsuite.service.ts` | — | Solo al integrar NetSuite |
| `NETSUITE_CONSUMER_KEY` | idem | — | Solo al integrar NetSuite |
| `NETSUITE_CONSUMER_SECRET` | idem | — | Solo al integrar NetSuite |
| `NETSUITE_TOKEN_ID` | idem | — | Solo al integrar NetSuite |
| `NETSUITE_TOKEN_SECRET` | idem | — | Solo al integrar NetSuite |
| `ARMSTRONG_BASE_URL` | `integrations/armstrong/armstrong.service.ts` | — | Solo al integrar Armstrong |
| `ARMSTRONG_AUTH_SCHEME` | idem | `bearer` | No |
| `ARMSTRONG_TOKEN` | idem | — | Solo al integrar Armstrong |

Si falta cualquier variable de un sistema de integración, ese sistema responde
`pendiente_credenciales` en lugar de fallar — comportamiento intencional (degradación honesta,
nunca se inventan datos).

## Frontend

| Variable | Dónde se usa | Default | Obligatoria |
|---|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `frontend/src/lib/api.ts` | `http://127.0.0.1:3004` | Sí en build (queda embebida en el bundle; requiere rebuild si cambia) |

## Docker Compose (`docker/docker-compose.yml`)
Inyecta hacia el contenedor `backend`: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`,
`DB_NAME`, `JWT_SECRET`, `FRONTEND_URL`, `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL`,
y el bloque completo de variables de Integration Hub (`VETA_*`, `NETSUITE_*`, `ARMSTRONG_*`).
Incluye `extra_hosts: host.docker.internal:host-gateway` para que el backend (en Docker)
alcance Ollama (nativo, systemd) en el host.

## Checklist al desplegar/migrar
- [ ] `JWT_SECRET` único y no compartido con ambientes de prueba.
- [ ] `OLLAMA_MODEL=qwen2.5:3b` (no usar el placeholder `7b-instruct` del código).
- [ ] `OLLAMA_EMBED_MODEL=nomic-embed-text`.
- [ ] `DB_PASSWORD` fuera de git (ya está en `.env`, no versionado).
- [ ] Variables de integración solo se llenan cuando Oben entregue credenciales oficiales
      (ver `REQUERIMIENTOS_OBEN.md`) — no antes.
