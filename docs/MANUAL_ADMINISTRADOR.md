# Manual del Administrador — DTA Oben

> Para quien administra usuarios, roles y la salud general de la plataforma. No cubre
> instalación/infraestructura (ver `MANUAL_TECNICO.md`) ni el uso diario (ver `MANUAL_OPERATIVO.md`).

## 1. Roles del sistema
Definidos en `UserRole` (`backend/src/entities/user.entity.ts`):

| Rol | Valor | Alcance previsto |
|---|---|---|
| Admin | `admin` | Gestión completa: usuarios, clientes, productos, órdenes, facturas, integraciones |
| Ventas | `sales` | Operación comercial: clientes, órdenes, cotizaciones |
| Producción | `production` | Visibilidad/gestión de órdenes en producción |
| Finanzas | `finance` | Facturas, validación de crédito |

El RBAC se aplica vía Guards (`JwtAuthGuard` + decoradores `@Roles`) sobre los controllers.
Cualquier endpoint sin guard de rol es accesible a cualquier usuario autenticado.

## 2. Gestión de usuarios
No existe hoy una UI de administración de usuarios ni endpoint de listado/edición de usuarios
expuesto fuera de `/auth/register` (autoservicio) y `/auth/login`. Para crear, modificar el rol
o desactivar un usuario:
- **Crear**: `POST /auth/register` con `email`, `password`, `firstName`, `lastName`, `role`
  (opcional, default `sales`).
- **Cambiar rol o desactivar**: requiere acceso directo a la base de datos (`UPDATE users SET
  role = ... WHERE email = ...`), ya que no hay endpoint de administración de usuarios en esta
  fase. Documentado como limitación conocida, no como bug — está fuera del alcance construido
  hasta ahora.

Usuario admin de referencia (demo, ya creado): `admin.demo@oben.com` / `DtaAdmin2026!`.

## 3. Seguridad
- **JWT**: tokens firmados con `JWT_SECRET` (variable de entorno, única por ambiente — ver
  `INVENTARIO_VARIABLES_ENV.md`). Rotar `JWT_SECRET` invalida todas las sesiones activas.
- **Refresh token**: `/auth/refresh` acepta `refreshToken` o `refresh_token` (compatibilidad
  con ambos nombres de campo, corregido tras hallazgo de QA).
- **RBAC / anti-escalada**: validado en Sprint Seguridad 0 — un usuario no admin no puede
  escalar su propio rol ni acceder a recursos de otro cliente vía IDOR.
- **Higiene de credenciales**: nunca commitear `.env` ni claves al repositorio. La clave SSH del
  operador NO debe quedar en texto plano en scripts locales — si se encuentra un script con
  credenciales embebidas, eliminarlas o moverlas a variables de entorno antes de reutilizarlo.

## 4. Salud del sistema
- `GET /health` → `{"status":"ok","db":"ok"}` confirma backend + conexión a PostgreSQL.
- `GET /eva/health` → confirma que Ollama responde y qué modelo está cargado.
- `GET /adan/stats` → documentos/fragmentos/embeddings indexados (debe crecer solo cuando se
  cargue conocimiento real, nunca con datos ficticios).
- `GET /integrations/status` → estado `configured`/`pendiente_credenciales` por sistema
  (VETA/NetSuite/Armstrong).
- Estado de contenedores: `docker compose ps` en el servidor (deben estar los 4 en `healthy`).

## 5. Backups
Ver `PLAN_BACKUP.md` para el procedimiento completo. Resumen para el administrador:
- Backup manual: `pg_dump` de `dta_db`.
- Restauración validada: probada contra una base temporal, conteos de filas/embeddings
  coincidentes.
- Pendiente de activar: cron de backup diario automatizado en el servidor (documentado, no
  activado todavía).

## 6. Qué el administrador NO debe hacer en esta fase
Por directiva vigente de congelamiento funcional:
- No modificar el código de EVA, ADÁN o el Integration Hub.
- No activar integraciones reales sin credenciales oficiales de Oben (ver
  `REQUERIMIENTOS_OBEN.md` y `CHECKLIST_INTEGRACIONES.md`).
- No cargar documentos ficticios en la base de conocimiento de ADÁN (ver
  `BASE_CONOCIMIENTO_OBEN.md`).
- No habilitar escritura hacia sistemas externos (VETA/NetSuite/Armstrong) sin payloads
  validados, pruebas controladas y aprobación explícita.

## 7. Referencias cruzadas
- Inventario completo de endpoints: `INVENTARIO_ENDPOINTS.md`.
- Inventario completo de variables de entorno: `INVENTARIO_VARIABLES_ENV.md`.
- Checklist de salida a producción: `CHECKLIST_GO_LIVE.md`.
- Arquitectura interna: `MANUAL_TECNICO.md`.
