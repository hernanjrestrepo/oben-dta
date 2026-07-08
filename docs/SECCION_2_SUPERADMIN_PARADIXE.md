# Sección 2 — Super Administrador Paradixe

Evidencia de implementación del panel SuperAdmin de plataforma. Todo lo descrito aquí fue
probado localmente (backend real en Docker + Postgres con pgvector, frontend Next.js real
en navegador) el 2026-07-08. Ningún dato es simulado ni afirmado sin ejecución.

## 1. Problema de bootstrap resuelto: login de usuarios de plataforma

**Hallazgo:** `AuthService.login()` siempre resuelve un tenant (`tenantSlug` o default `oben`)
y filtra `WHERE email = ? AND tenant_id = ?`. Un usuario de plataforma tiene `tenant_id IS NULL`,
por lo que **nunca podía autenticarse** por ese endpoint. Esto bloqueaba por completo la
existencia funcional de "Usuarios Plataforma".

**Fix:** nuevo método `AuthService.platformLogin()` + endpoint `POST /auth/platform-login`
(`email` + `password`, sin `tenantSlug`), que busca `WHERE email = ? AND tenant_id IS NULL`
usando `IsNull()` de TypeORM explícitamente (no comparación implícita, que TypeORM ignora si
se pasa `undefined`).

Archivos: [`backend/src/modules/auth/auth.service.ts`](../backend/src/modules/auth/auth.service.ts),
[`backend/src/modules/auth/auth.controller.ts`](../backend/src/modules/auth/auth.controller.ts),
[`backend/src/modules/auth/dto/auth.dto.ts`](../backend/src/modules/auth/dto/auth.dto.ts).

## 2. Bootstrap del primer SuperAdmin sin SQL manual

Problema del huevo-y-la-gallina: crear el primer usuario de plataforma requiere el permiso
`platform.users.manage`, que solo lo otorga un platform role, que solo se asigna con un
endpoint que requiere `platform.tenants.manage`. Nadie lo tiene en una instalación nueva.

**Solución:** CLI `backend/src/cli/create-platform-superadmin.ts`
(`npm run platform:bootstrap -- --email=... --password=... --firstName=... --lastName=...`),
que usa las **mismas clases de servicio que la API** (`PlatformRolesService`, repositorio de
`User` vía `getRepositoryToken`), no SQL crudo. Es idempotente: si el usuario ya existe, solo
asegura el rol y opcionalmente resetea el password.

**Evidencia de ejecución real** (contenedor `dta-backend` local, Postgres 16 + pgvector, base
de datos limpia):

```
$ npm run platform:bootstrap -- --email=superadmin@paradixe.com --password=*** --firstName=Super --lastName=Admin
[PlatformBootstrapCLI] Usuario de plataforma creado: superadmin@paradixe.com (2709c6b4-909d-4b20-b5bf-711e6bf4882f)
[PlatformBootstrapCLI] Rol de plataforma asegurado: platform.superadmin
[PlatformBootstrapCLI] LISTO. Login vía POST /auth/platform-login con email + password.
```

## 3. Endpoints nuevos (todos protegidos por `JwtAuthGuard` + `PermissionsGuard` + permiso
data-driven, auditados en `authorization_audit`)

| Endpoint | Permiso | Función |
|---|---|---|
| `POST /auth/platform-login` | — (público, análogo a login) | Login exclusivo de usuarios de plataforma |
| `GET/POST/PATCH/DELETE /platform/users` | `platform.users.read` / `platform.users.manage` | CRUD de usuarios de plataforma |
| `GET /platform/audit` | `platform.audit.read` | Consulta paginada y filtrable de `authorization_audit` (antes solo insert) |
| `GET /platform/system-status` | `platform.system.read` | Estado de BD, migraciones, tenants, suscripciones, usuarios de plataforma |

Permisos nuevos agregados al catálogo (`security-catalog.ts`): `platform.users.read`,
`platform.users.manage`, `platform.system.read`. Ya existían y se reutilizan sin cambios:
`platform.tenants.*`, `platform.plans.manage`, `platform.subscriptions.manage`,
`platform.feature_flags.manage`, `platform.audit.read`.

Archivos nuevos: `platform-users.service.ts`, `platform-users.controller.ts`,
`platform-audit.service.ts`, `platform-audit.controller.ts`,
`platform-system-status.service.ts`, `platform-system.controller.ts` (todos en
`backend/src/modules/security/`), registrados en `security.module.ts`.

**Bug encontrado y corregido durante la prueba real:** la columna `isActive` en la entidad
`User` no tiene mapeo `name:` a snake_case (a diferencia de `is_super_admin`, que sí lo tiene),
por lo que en Postgres la columna real es `"isActive"` (camelCase, quoted), no `is_active`.
El SQL crudo de `PlatformSystemStatusService` fallaba con `column "is_active" does not exist`
hasta corregirlo a `"isActive"` — confirmado contra el esquema real (`\d users` en psql).

## 4. Panel frontend (`frontend/src/app/platform/`)

Next.js real, no maqueta. Rutas:

- `/platform/login` — login exclusivo de plataforma (público, agregado a `middleware.ts`)
- `/platform` — Estado del sistema (dashboard con datos de `/platform/system-status`)
- `/platform/tenants` + `/platform/tenants/[id]` — CRUD de tenants, asignación de
  suscripción/plan, feature flags por módulo, vista de licencia efectiva
- `/platform/plans` — catálogo de planes, alta de plan, toggle de módulos por plan
- `/platform/users` — CRUD de usuarios de plataforma, activar/desactivar, eliminar
- `/platform/audit` — tabla paginada y filtrable de auditoría

Guard de acceso (`app/platform/(admin)/layout.tsx`): redirige a `/platform/login` si no hay
sesión, y a `/dashboard` si el usuario autenticado tiene `tenantId` (un usuario de un tenant
nunca puede ver el panel de plataforma).

### Evidencia de prueba en navegador real (Next.js dev server local, puerto 3000, backend
Docker real en puerto 3004)

1. Login con `superadmin@paradixe.com` → `POST /auth/platform-login → 201 Created` →
   redirección a `/platform`.
2. `/platform` → tarjetas con datos reales: BD OK, 4 migraciones, 1 tenant activo,
   1 suscripción trial, 1 usuario de plataforma (superadmin).
3. `/platform/tenants` → tabla con tenant real `oben` / Oben Group.
4. `/platform/tenants/[id]` → asignación de suscripción visible (plan Starter, trial, sin
   vencimiento), módulos de licencia efectiva listados, feature flags de todos los módulos
   del catálogo con toggle en vivo — probado activando `clients` (`Deshabilitado` →
   `Habilitado` tras `PUT /platform/tenants/:id/feature-flags` real).
5. `/platform/users` → usuario SuperAdmin real listado con su rol `platform.superadmin`,
   botones activar/desactivar/eliminar operativos.
6. `/platform/audit` → 35 registros reales generados por la propia navegación de prueba,
   incluyendo ruta, método, usuario, tenant (`plataforma` para acciones sin tenant) y
   resultado (permitido/denegado).

**Nota técnica:** el clic automatizado del navegador vía CDP no siempre dispara el manejador
`onSubmit`/`onClick` de React si la hidratación aún no adjuntó los listeners; se verificó
disparando el evento nativo (`element.click()`) desde el propio contexto de la página, lo cual
confirmó que el código de producción funciona correctamente — el problema era únicamente de
temporización de la herramienta de automatización, no del código de la aplicación.

## 5. Verificación de calidad

- `npx tsc --noEmit` → limpio (backend y frontend).
- `npx jest` → 108/108 tests, sin regresión.
- `npm run build` (frontend, Next.js 16.2.4 + Turbopack) → compila y genera todas las rutas
  nuevas (`/platform`, `/platform/tenants`, `/platform/tenants/[id]`, `/platform/plans`,
  `/platform/users`, `/platform/audit`, `/platform/login`) sin error de tipos.

## 6. Pendiente explícito (no resuelto en esta sección, corresponde a secciones posteriores)

- El modelo de "Licencia" hoy es la suscripción (`TenantSubscription`) + `plan_modules` +
  `tenant_feature_flags`. La Sección 3 (Motor de Licenciamiento Enterprise) debe enriquecerlo
  con: fecha de vencimiento obligatoria por tenant, máximo de usuarios/sedes, consumo,
  bloqueo de acceso al expirar, y firma criptográfica (Sección 4).
- El "Estado del sistema" de esta sección es un resumen administrativo (conteos), no el
  dashboard de observabilidad completo (Redis, IA, Integration Hub, tracing) que pide la
  Sección 7 — se construye ahí para no duplicar esfuerzo.
