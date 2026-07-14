# Arquitectura Actualizada — Oben DTA

**Documento canónico generado al cierre de WO-013.** Sustituye a `ARQUITECTURA-REAL.md`, `MATRIZ-INTEGRACIONES.md` y demás documentos de arquitectura anteriores a este work order — aquellos describían un estado del producto que ya no existe (dependía de EVA/ADÁN/Ollama, carecía de licenciamiento, administración enterprise, workflow de negocio real y demo automática).

Fecha de cierre: 2026-07-14. Rama: `sprint2-customer-core`.

## 1. Visión general

Oben DTA es un ERP/SaaS multi-tenant para gestión comercial (cotizaciones → órdenes → facturas), con automatización del ciclo comercial por correo, licenciamiento comercial propio y una capa de integraciones desacoplada de cualquier sistema externo real. **No tiene ninguna dependencia funcional de motores de IA externos** (EVA, ADÁN y Ollama fueron eliminados por completo en el Sprint 1 de este work order).

## 2. Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Backend | NestJS | 11.x |
| ORM | TypeORM | 0.3.28 |
| Base de datos | PostgreSQL | 16 (alpine) |
| Cache/colas | Redis | 7 (alpine) |
| Frontend | Next.js (App Router, Turbopack) | 16.2.4 |
| UI runtime | React | 19.2.4 |
| Contenedores | Docker Compose | 3 servicios: `postgres`, `redis`, `backend`, `frontend` |
| Firma de licencias | Ed25519 (Node `crypto` nativo) | — |

## 3. Módulos del backend (`backend/src/modules/`)

| Módulo | Responsabilidad |
|---|---|
| `auth` | Login, refresh tokens (rotación + `tokenVersion`), fuerza bruta (bloqueo por intentos fallidos) |
| `tenants` | Alta y gestión de tenants |
| `security` | RBAC completo: catálogo de permisos/módulos, roles, usuarios de tenant, usuarios de plataforma, licenciamiento comercial, auditoría de negocio, guards |
| `clients` | CRUD de clientes, cupo de cartera |
| `products` | Catálogo de productos, stock, comprometido |
| `orders` | Órdenes reales con máquina de estados (`DRAFT → PENDING_VALIDATION → CONFIRMED → PENDING_PRODUCTION → IN_PRODUCTION → READY_FOR_DELIVERY → DELIVERED`, más `BLOCKED`/`CANCELLED`) |
| `invoices` | Facturas generadas a partir de una orden, numeración secuencial por tenant, estado DIAN |
| `quotes` | Pipeline comercial completo (correo → cliente → cotización → PDF → envío → aprobación → pago → orden → factura → producción → entrega), servicio de demo automática |
| `integrations` | Integration Hub: interfaz común + adapters (simuladores + un adapter HTTP real genérico) |
| `dataset` | Generador determinista de datos semilla para demo/desarrollo |
| `dashboard` | Agregación de KPIs |

## 4. Modelo de datos (entidades TypeORM relevantes)

`tenant`, `user`, `role`, `permission`, `module-catalog`, `plan`, `plan-module`, `tenant-subscription`, `tenant-feature-flag`, `platform-role`, `platform-user-role`, `license`, `workflow-event` (auditoría de negocio), `client`, `product`, `quote` + `quote-item`, `order` + `order-item`, `invoice`. Entidades de comercio exterior (`export-operation`, `export-cost-sheet`, `shipment`, `shipment-tracking`, `packing-list`, `master-packing-list`, `production-order`, `material-consumption`, `raw-material-consumption`, `packaging-consumption`, `credit-validation`, `freight-quote`, `insurance-quote`, `incoterm`, `mock-scenario`) sostienen el dataset determinista y los simuladores de integración; no son parte del flujo comercial núcleo de WO-013 pero coexisten sin conflicto.

Nota: existe una tabla `embeddings` (pgvector) heredada de un intento previo de RAG documental (ADÁN). El Sprint 1 de este work order retiró todo el código que la usaba; la extensión `vector` de Postgres nunca llegó a instalarse, así que la tabla queda inerte y sin referencias — no se fuerza su eliminación porque requeriría instalar la extensión solo para poder hacer el `DROP`. No afecta funcionalidad ni migra datos.

## 5. RBAC — catálogo de módulos de permisos

`platform`, `users`, `security`, `clients`, `products`, `orders`, `invoices`, `quotes`, `inventory`, `production`, `exportations`, `finance`, `integrations`, `automations`, `reports`, `dashboard`, `configuracion`, `auditoria`, `licencias`.

Cada módulo tiene permisos CRUD estándar (`.read`/`.create`/`.update`/`.delete`) más permisos extra específicos del dominio (`quotes.approve`, `invoices.mark_paid`, `production.execute`, `automations.execute`, etc.). Los roles son 100% configurables por tenant vía matriz de checkboxes en `/admin/roles` — no hay permisos hardcodeados en el frontend ni en los guards; `PermissionsGuard` + `RequirePermission()` resuelven todo contra el catálogo real en base de datos a través de `AuthorizationService`.

`AuthorizationService.evaluate()` valida, en orden: rol de plataforma (si aplica) → políticas conectables → **validez de la licencia comercial del tenant** → **licenciamiento del módulo según el plan contratado** → permiso del rol del usuario. Una licencia inválida bloquea toda operación gateada por permiso, no solo la UI.

## 6. Licenciamiento comercial

- Firma asimétrica Ed25519: la clave privada solo existe en el emisor (Paradixe); la pública permite verificación offline.
- `validate()` recalcula la firma sobre el contenido actual de la fila de `licenses` en cada verificación — editar `expires_at`/`maxUsers` directo en la base de datos invalida la firma (`tampered`), sin importar lo que diga la columna `status`.
- **Fingerprint de instalación**: cada licencia queda atada (opcionalmente, para compatibilidad retroactiva) a un hash de `pg_control_system().system_identifier` del Postgres donde fue emitida. Copiar el código + la fila de licencia a otra base de datos deja de validar (`installation_mismatch`) aunque la firma siga siendo genuina.
- Período de gracia configurable (`gracePeriodDays`), validación de renovación recomendada desde el día 15 de cada mes (`renewalDue`).
- Bloqueo puramente operativo: una licencia inválida nunca borra ni corrompe datos, solo impide operar (pantalla de bloqueo en frontend + rechazo de API en backend).
- Auditoría de licencias: `issue()`/`renew()`/`setStatus()` registran evento en `workflow_events` (workflow `license-lifecycle`), consultable vía `GET /auditoria`.
- Renovación remota vía `PUT /platform/tenants/:tenantId/license/renew` (solo SuperAdmin de plataforma).

## 7. Integration Hub

Interfaz común (`IntegrationHubService.call(system, operation, payload)`) sobre un `AdapterRegistry` que resuelve, por tenant, si un sistema corre en modo **mock** (simulador funcional real, con las mismas validaciones de negocio y errores que tendría la API real) o modo **real** (`GenericHttpRealAdapter` u otro adapter real específico). Sistemas cableados: NetSuite (ERP), VETA (producción), Armstrong (logística), DIAN (factura electrónica), Oracle (financiero), Oben ERP (productos/inventario), CubeIQ (optimización de carga), EFranco (agente aduanero), Transporte/Shipping, Email, WhatsApp.

Conectar un sistema real no requiere recompilar: la configuración (`baseUrl`, esquema de autenticación, credenciales, mapa de rutas) vive en `tenants.integration_config.<system>` y el `AdapterRegistry` la resuelve en tiempo de ejecución.

## 8. Flujo comercial automatizado (`quotes` + `demo`)

`QuotesService` implementa el pipeline completo con auditoría en cada paso (`workflow_events`, workflow `quote-to-cash`):

```
correo entrante → identificar/crear cliente → generar cotización →
generar PDF → enviar respuesta por correo → aprobación (simulada o real) →
link de pago → confirmación de pago → ORDEN real → FACTURA real →
producción → listo para despacho → entregado
```

La orden y la factura generadas en el paso de pago son entidades reales (`Order`/`Invoice`), creadas a través de los mismos `OrdersService`/`InvoicesService` que usa el flujo manual — no hay datos inventados ni pasos puramente visuales. El estado de la orden avanza en paralelo con el de la cotización a través de su propia máquina de estados validada.

`DemoService` (`POST /demo/run`, permiso `automations.execute`) ejecuta este mismo pipeline de punta a punta sobre un correo sintético, eligiendo dinámicamente el producto activo más barato con stock disponible del tenant — es el mecanismo detrás del botón "Ejecutar demo" del Centro de Operaciones.

## 9. Frontend

Next.js App Router con un único layout compartido (`app/(app)/layout.tsx`) para todas las vistas autenticadas. Navegación (RBAC-consciente, oculta ítems sin permiso): Centro de Operaciones, Dashboard, Cotizaciones, Órdenes, Facturas, Clientes, Auditoría (si `auditoria.read`), Administración (si `users.read`, incluye gestión de usuarios y matriz de roles/permisos). `LicenseGate` envuelve toda la experiencia autenticada de tenant y bloquea el acceso operativo si la licencia no es válida, sin afectar el acceso de SuperAdmin de plataforma (`/platform/*`).

Identidad visual: navy `#003366`, monograma "O", favicon SVG propio, loading states y plantillas de correo HTML con branding Oben — sin ningún residuo del template genérico de Next.js.

## 10. Qué queda pendiente de Oben (no de Paradixe)

Todo el software está terminado y operando sobre simuladores funcionales completos. Lo único pendiente para producción real es que Oben decida **qué integraciones activar** y entregue las credenciales correspondientes (URL, API key/token, mapa de rutas si aplica) para NetSuite, VETA, Armstrong, DIAN, Oracle u otras. Cambiar de modo mock a modo real es una configuración por tenant, no un cambio de código.
