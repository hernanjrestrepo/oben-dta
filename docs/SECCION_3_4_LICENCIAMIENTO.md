# Secciones 3 y 4 — Motor de Licenciamiento Enterprise y Protección del Producto

Evidencia de implementación, probada de extremo a extremo el 2026-07-08 contra backend
real (Docker + Postgres 16 + pgvector) y frontend real (Next.js) en navegador.

## 1. Modelo de datos

Tabla `licenses` (migración `0004_licensing.sql`, idempotente) + columna `tenants.installation_id`
(UUID único generado una sola vez por tenant, nunca cambia).

Campos por licencia: `id` (licenseId), `tenant_id` (companyId), `installation_id`, `plan_key`,
`status` (active/suspended/revoked), `max_users`, `max_sites`, `issued_at`, `activated_at`,
`expires_at`, `grace_period_days`, `offline`, `signature`, `signing_key_id`,
`last_renewal_request_at`.

## 2. Firma criptográfica (protección contra manipulación manual)

`LicenseSigningService` (Ed25519 asimétrico, `backend/src/modules/security/license-signing.service.ts`):
firma el JSON canónico de los campos de negocio de la licencia. La clave privada solo existe
en el emisor (variables `LICENSE_SIGNING_PRIVATE_KEY`/`PUBLIC_KEY`, generadas con
`npm run license:generate-keys`); en producción son obligatorias (el arranque falla si faltan).

**Esto es lo que hace inútil editar la fila `licenses` directamente en Postgres**: `validate()`
recalcula la firma sobre el contenido ACTUAL de la fila y la compara contra `signature`. Un
`UPDATE licenses SET expires_at = ...` manual no puede producir una firma válida sin la clave
privada, así que la licencia pasa a `reason=tampered` sin importar qué diga la columna `status`.

Cubierto por 6 tests unitarios (`license-signing.service.spec.ts`): firma/verifica, detecta
cambio en `expiresAt`, detecta cambio en `maxUsers` (escalada), rechaza firmas corruptas,
rechaza firmas de OTRO par de claves, y confirma que dos instancias con las mismas claves reales
(no efímeras) interoperan. Más 9 tests de ciclo de vida (`licensing.service.spec.ts`): issue,
renew, tamper en `expiresAt`, tamper en `maxUsers`, período de gracia, expiración dura,
suspensión, revocación, reissue idempotente.

## 3. Ciclo de vida (`LicensingService`)

- `issue(tenantId, dto)`: genera `installationId` si el tenant no lo tiene, firma y persiste.
  Se llama automáticamente en `TenantsService.provisionTenant()` — **todo tenant nuevo recibe
  una licencia trial de 30 días sin ningún paso manual.**
- `renew(tenantId, dto)`: extiende `expiresAt` y re-firma.
- `setStatus(tenantId, status)`: suspende/revoca (re-firma con el nuevo status).
- `validate(tenantId)`: firma → expiración → gracia → status, en ese orden. Nunca confía en
  columnas sin antes verificar la firma.

## 4. Enforcement (bloqueo real, no solo UI)

`AuthorizationService.evaluate()` consulta `LicensingService.validate()` **antes** de resolver
el módulo licenciado, para TODO permiso de tenant. Si la licencia no es válida, deniega con
`license_<reason>` (`license_expired`, `license_tampered`, `license_suspended`,
`license_revoked`, `license_no_license`). Esto bloquea la API completa, no solo la navegación
del frontend — confirmado con evidencia real más abajo.

`AuthService.login()` embebe el estado de licencia en la respuesta (`license: {...}`) sin
bloquear el login, para que el frontend pueda mostrar la pantalla de bloqueo con contexto.
El login de plataforma (`/auth/platform-login`) es completamente independiente y nunca se ve
afectado por la licencia de ningún tenant.

## 5. Evidencia de ejecución real (curl contra `dta-backend` local)

```
# Tenant "oben" recién provisionado, licencia trial automática:
GET /platform/tenants/:id/license →
  { "commercialLicense": {...}, "valid": true, "daysRemaining": 30, ... }

# Forzando expiración vía renew con fecha pasada:
PUT /platform/tenants/:id/license/renew  { "expiresAt": "2020-01-01..." }
GET /platform/tenants/:id/license → { "valid": false, "reason": "expired" }

# Usuario del tenant, licencia vencida:
GET /license/status → { "valid": false, "reason": "expired", "daysRemaining": -2380 }
GET /clients → 403 { "message": "Permiso denegado: clients.read (license_expired)" }

# Renovando:
PUT /platform/tenants/:id/license/renew  { "durationDays": 30 }
GET /license/status → { "valid": true, "daysRemaining": 30 }
GET /clients → 403 (no_matching_role — la licencia ya NO es el bloqueo; cae al RBAC normal)
```

El último resultado (`no_matching_role` en vez de `license_expired`) es la prueba de que el
gate de licencia es una capa independiente de RBAC: al restaurarse, el flujo cae correctamente
al siguiente nivel de autorización.

## 6. Frontend

- `LicenseGate` (`frontend/src/components/LicenseGate.tsx`), montado en el layout raíz: si el
  usuario tiene `tenantId` y su licencia no es válida, reemplaza toda la aplicación por una
  pantalla de bloqueo profesional — **sin borrar ni afectar datos**, con mensaje explícito de
  que la información está intacta y el bloqueo es solo operativo. Exento en `/login` y
  `/platform/*` (los usuarios de plataforma nunca pasan por este gate).
- Probado en navegador real: login con licencia vencida → pantalla de bloqueo con fecha de
  vencimiento visible; tras renovar desde el panel SuperAdmin y recargar → acceso restaurado
  al Centro de Operaciones IA normal.
- Panel SuperAdmin (`/platform/tenants/[id]`): sección "Licencia comercial" con estado
  (válida/gracia/inválida), installation ID, fechas, días restantes, aviso de renovación
  recomendada, y formulario real de emisión/renovación — sin SQL manual.

## 7. Período de gracia y recordatorio de renovación

`gracePeriodDays` (configurable por licencia, default 7): una licencia vencida pero dentro de
la gracia se trata como válida (`graceActive: true`) para permitir licencias offline con
tolerancia a desconexión. `renewalDue` se calcula como `día-del-mes >= 15 AND
daysRemaining <= 30` y se expone en `/license/status` y en el panel admin — probado por unit
test (`gracePeriodDays` cubre la ventana → válida; más allá → `expired`).

## 8. CLI de generación de claves

`npm run license:generate-keys` (`backend/src/cli/generate-license-keys.ts`) genera un par
Ed25519 real y lo imprime en formato listo para pegar en `.env`. Ejecutado y verificado: las
claves generadas cargaron correctamente en el contenedor (`LicenseSigningService: Claves de
firma de licencia cargadas (keyId=paradixe-2026-07-08)`).

## 9. Calidad

- `npx tsc --noEmit` limpio (backend y frontend).
- `npx jest`: 126/126 tests (15 nuevos de licenciamiento).
- `next build`: compila y genera todas las rutas sin error de tipos.
- Migración `0004_licensing.sql` aplicada limpiamente contra base de datos con datos
  preexistentes (confirmado en logs: `[migrations] aplicada 0004_licensing.sql`).

## 10. Pendiente explícito (Sección 4 avanzada, fuera de alcance inmediato)

- Licencia offline con generación de token firmado descargable (hoy el período de gracia
  cubre desconexiones cortas; un token offline portable para instalaciones sin red persistente
  es una extensión natural sobre la misma infraestructura de firma).
- Hardware fingerprinting para atar la licencia a una máquina física específica (hoy la
  licencia está atada al `installationId` lógico del tenant, suficiente para el modelo SaaS
  actual; el fingerprint de hardware es relevante solo para despliegues on-premise futuros).
