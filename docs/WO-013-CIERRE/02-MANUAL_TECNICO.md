# Manual Técnico — Oben DTA

**Documento canónico generado al cierre de WO-013.** Sustituye a `MANUAL_TECNICO.md` previo (describía un estado del sistema con dependencia de EVA/ADÁN/Ollama).

Fecha de cierre: 2026-07-14.

## 1. Requisitos

- Docker + Docker Compose
- Puertos libres en el host: `3004` (backend), `3000` (frontend, configurable), `5433` (Postgres, mapeado desde 5432), `6381` (Redis, mapeado desde 6379) — los mapeos de host pueden ajustarse en `docker/docker-compose.yml` si colisionan con otros servicios locales.

## 2. Despliegue

```bash
cd docker
cp .env.example .env
# Editar .env: contraseñas fuertes, JWT_SECRET, claves de licenciamiento

# Generar par de claves Ed25519 para firma de licencias (una sola vez):
cd ../backend && npm run license:generate-keys
# Pegar las claves generadas (base64) en docker/.env

cd ../docker
docker compose build
docker compose up -d
```

Verificación de arranque:

```bash
curl http://localhost:3004/health
# {"status":"ok","db":"ok","timestamp":"..."}
```

El primer arranque ejecuta `SecurityBootstrapService`, que siembra el catálogo de módulos/permisos/planes si no existe (idempotente — nunca duplica ni pisa datos existentes).

## 3. Variables de entorno (`docker/.env`)

| Variable | Descripción |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciales del contenedor Postgres |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` | Conexión del backend a Postgres (mismo host que arriba, nombre de servicio Docker) |
| `JWT_SECRET` | Secreto de firma de tokens de sesión (≥32 caracteres aleatorios) |
| `JWT_EXPIRES_IN` | Vigencia del access token (default `7d`) |
| `PORT` | Puerto HTTP del backend (`3004`) |
| `NODE_ENV` | `production` en despliegue real — fuerza claves de licenciamiento explícitas |
| `FRONTEND_URL` | Origen permitido para CORS |
| `REDIS_HOST` / `REDIS_PORT` | Conexión a Redis |
| `LICENSE_SIGNING_PRIVATE_KEY` / `LICENSE_SIGNING_PUBLIC_KEY` | Par Ed25519 en base64, generado con `npm run license:generate-keys`. **Obligatorias en producción** — sin ellas el backend rehúsa arrancar en `NODE_ENV=production` (en desarrollo genera un par efímero con warning explícito). |
| `LICENSE_SIGNING_KEY_ID` | Identificador de la clave activa (rotación futura) |
| `NEXT_PUBLIC_BACKEND_URL` (frontend) | URL pública del backend consumida por el navegador |

No existe ninguna variable de entorno relacionada con IA/LLM (`OLLAMA_*` fue retirado por completo en el Sprint 1 de WO-013).

## 4. Inventario de endpoints (rutas base)

| Ruta base | Módulo |
|---|---|
| `/auth` | Login, refresh, registro |
| `/users` | CRUD de usuarios del tenant |
| `/security` | Catálogo de permisos, roles, planes |
| `/clients` | Clientes |
| `/products` | Productos |
| `/orders` | Órdenes |
| `/invoices` | Facturas |
| `/quotes` | Pipeline comercial (cotizaciones) |
| `/demo` | `POST /demo/run` — demo automática end-to-end |
| `/integrations`, `/integrations/scenarios` | Estado del Integration Hub y panel de escenarios de simulación |
| `/license` | `GET /license/status` — estado de licencia del tenant autenticado |
| `/auditoria` | Consulta de auditoría de negocio (`workflow_events`) del tenant |
| `/platform` | Gestión de plataforma (planes, suscripciones, feature flags, licencias, roles de plataforma) — requiere rol de plataforma |
| `/platform/users` | CRUD de usuarios de plataforma (SuperAdmin) |
| `/platform/audit` | Auditoría de autorizaciones (`authorization_audit`) a nivel plataforma |
| `/platform/system-status` | Estado del sistema (health agregado) |
| `/platform/dataset` | Regeneración del dataset determinista de demo |

Todas las rutas de tenant están protegidas por `JwtAuthGuard` + `PermissionsGuard`; las de plataforma requieren un rol de plataforma válido y no dependen de ninguna licencia de tenant.

## 5. Base de datos

`synchronize: true` en entornos no productivos — TypeORM sincroniza el esquema automáticamente contra las entidades. En producción se recomienda pasar a migraciones explícitas antes de un primer despliegue con datos reales de cliente (fuera de alcance de WO-013: es una decisión operativa de Oben/Paradixe sobre el proceso de release, no una falla del producto).

Backups: `docker exec dta-postgres pg_dump -U <user> <db> > backup.sql`. Restauración: `docker exec -i dta-postgres psql -U <user> <db> < backup.sql`.

## 6. Comandos de verificación

```bash
# Backend
cd backend
npx tsc --noEmit      # type-check
npm test              # suite completa (141 tests al cierre de WO-013)

# Frontend
cd frontend
npx tsc --noEmit
npm run build          # build de producción (Next.js/Turbopack)
```

## 7. Reconstrucción de contenedores tras un cambio de código

```bash
cd docker
docker compose build backend    # o frontend
docker compose up -d --force-recreate backend
curl http://localhost:3004/health
```

## 8. Generación de claves de licenciamiento

```bash
cd backend
npm run license:generate-keys
```

Imprime un par Ed25519 en base64 por consola. La clave privada **nunca** debe salir del entorno del emisor (Paradixe) ni versionarse en git.
