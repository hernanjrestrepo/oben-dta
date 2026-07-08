# Sección 5 (parcial) — Hardening de Seguridad: autenticación

Auditoría ejecutada sobre `backend/` buscando específicamente: fuerza bruta, replay de
tokens, secuestro de sesión, CSRF, XSS, SQL injection, recuperación de contraseña.
Hallazgos y correcciones, con evidencia real contra el backend en Docker (2026-07-08).

## Hallazgos confirmados y corregidos

1. **Sin protección de fuerza bruta por cuenta** — `auth.controller.ts` no tenía límite
   específico en `/auth/login` ni `/auth/platform-login` más allá de los buckets globales
   de `ThrottlerModule` (compartidos entre todas las rutas). **Fix:** `User.failedLoginAttempts`
   + `User.lockedUntil` (migración `0005_auth_hardening.sql`); tras 5 intentos fallidos,
   bloqueo de 15 minutos — verificado con evidencia real: 5 intentos fallidos + 6to intento
   con password CORRECTA → `"Cuenta bloqueada temporalmente... 15 minuto(s)"`. Además,
   `@Throttle({ medium: { limit: 10, ttl: 60_000 } })` en ambos endpoints de login.

2. **Refresh tokens sin rotación ni revocación** — `refresh()` reemitía el access token pero
   devolvía/aceptaba el MISMO refresh token indefinidamente hasta su expiración de 7 días;
   `logout()` era un no-op que no invalidaba nada server-side. **Fix:** `User.tokenVersion`
   embebido en el payload JWT (`ver`); cada `refresh()` avanza `tokenVersion` y emite un par
   nuevo (rotación); reutilizar un refresh token ya rotado falla con
   `"Refresh token revocado"`; `logout()` avanza `tokenVersion`, invalidando de inmediato
   cualquier refresh token vigente. Verificado con evidencia real: primer refresh exitoso con
   `refresh_token` nuevo distinto del original; reutilizar el original → 401 "revocado".

3. **Refresh nunca se usaba desde el frontend** — el interceptor de axios solo limpiaba la
   sesión y redirigía a `/login` en cualquier 401, dejando el flujo de refresh como código
   muerto (endpoint completo sin ningún llamador real). **Fix:**
   `frontend/src/lib/api.ts` intenta un refresh silencioso una vez por request fallido antes
   de forzar la sesión; con deduplicación (`refreshPromise` compartido) para no disparar
   refrescos concurrentes cuando varias requests fallan a la vez. Excluye explícitamente los
   propios endpoints de login/refresh para evitar bucles. Redirige a `/platform/login` o
   `/login` según el tipo de usuario de la sesión perdida.

## Hallazgos evaluados y descartados (no aplican / ya cubiertos)

- **CSRF**: la autenticación es 100% Bearer-token en el header `Authorization`; el backend
  no usa `cookie-parser` ni sesiones, y nunca lee `req.cookies`. La cookie que el frontend sí
  escribe es exclusivamente para el gate de rutas del middleware de Next.js, no para
  autenticar contra el backend — no hay superficie CSRF real.
- **XSS**: no se encontró ningún `dangerouslySetInnerHTML` en el frontend; React escapa por
  defecto todo el contenido dinámico renderizado.
- **SQL injection**: todo el SQL crudo en `AuthorizationService` y `PlatformAuditService` usa
  parámetros posicionales (`$1`, `$2`, ...). Los únicos casos de interpolación de string en
  SQL (`platform-system-status.service.ts`, `dataset-generator.service.ts`) interpolan
  nombres de tabla/columna HARDCODEADOS en el propio código fuente, nunca valores derivados
  de la request — no son inyectables.
- **Headers de seguridad y CORS**: ya cubiertos desde Bloque 2 (Helmet + whitelist de origen
  en `main.ts`), sin cambios necesarios.

## Pendiente explícito de esta sección

- Flujo de recuperación de contraseña (forgot/reset password) — no existe todavía ningún
  endpoint. Requiere decidir el canal de entrega (el Integration Hub ya tiene un
  `EmailMockAdapter` funcional que puede usarse para simular el envío del enlace).
- Rate limiting específico por email/IP combinados (hoy el throttling es solo por IP) para
  cubrir ataques distribuidos de credential stuffing.

## Calidad

- 8 tests nuevos en `auth.service.spec.ts` (login exitoso resetea intentos, password
  incorrecta incrementa contador, 5to intento bloquea, cuenta bloqueada rechaza incluso
  password correcta, bloqueo vencido permite login, refresh rota tokenVersion, reutilización
  de refresh token es rechazada, logout invalida el refresh token vigente).
- Suite completa: 134/134 tests, `tsc --noEmit` limpio en backend y frontend, `next build`
  limpio.
- Verificado end-to-end contra el backend real en Docker (no solo con mocks): bloqueo por
  fuerza bruta y rotación/revocación de refresh token confirmados con `curl`.
