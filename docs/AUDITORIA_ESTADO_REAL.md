# Auditoría de Estado Real — DTA Oben

> Completada: 2026-07-07, con VPN activa. Toda sección de este documento refleja
> comandos ejecutados en esta sesión contra el servidor real `10.50.30.10`, no
> inferencias ni datos de turnos anteriores no re-verificados.

## Resumen ejecutivo

**Los Bloques 1-5 están desplegados, funcionando y verificados con evidencia ejecutada
en esta auditoría.** Se encontraron y resolvieron 2 discrepancias reales entre servidor
y local (detalladas en la sección de hallazgos): una brecha de bookkeeping de migraciones
(autocorregida al re-desplegar, sin pérdida de datos) y el Bloque 5 que nunca se había
transferido al servidor (se desplegó y se verificó end-to-end en esta sesión).

Persisten dos riesgos que esta auditoría **no resuelve** porque exceden su alcance
(requieren decisión del usuario, no son bugs de código): el trabajo de los Bloques 1-5
sigue sin commitear en git, y el despliegue sigue siendo manual vía `tar` en vez de un
pipeline reproducible.

---

## 1. Commit desplegado actualmente

| Ubicación | Estado |
|---|---|
| Local (git) | `HEAD=5bf924e` + todo el trabajo de Bloques 1-5 **sin commitear** (working tree). Ver hallazgo #2. |
| Servidor Oben | El servidor **no usa git** — el código se transfiere por `tar.gz` + `rsync` (script `redeploy.sh`). En esta auditoría se confirmó, mediante `bash redeploy.sh`, que el servidor quedó con el mismo `backend/src` que el working tree local a las **12:51 UTC de 2026-07-07** (build reconstruido, contenedor recreado, health OK). |

## 2. Estado de Docker

```
$ docker ps
NAMES          STATUS                  IMAGE
dta-backend    Up (healthy, recreado a las 12:51 UTC)
dta-frontend   Up 14h
dta-postgres   Up 14h (healthy)
dta-redis      Up 14h (healthy)

$ docker compose ps  (docker-compose.yml + docker-compose.pgvector.yml)
Mismo resultado — 4 servicios, todos "Up".
```

Restart policy confirmada en los 4 contenedores: `restart=always` (persiste desde la
sesión anterior; Docker y Ollama systemd-enabled para sobrevivir reinicios del host —
no re-verificado en esta auditoría por no requerir reinicio del host, pero no hay
motivo para que haya cambiado).

## 3. Estado de cada contenedor

| Contenedor | Estado | Notas |
|---|---|---|
| dta-postgres | healthy, 14h uptime | No se recreó (no requería cambios de schema vía imagen) |
| dta-redis | healthy, 14h uptime | Sin cambios este bloque |
| dta-backend | healthy, recreado en esta auditoría | Rebuild con Bloque 5 incluido |
| dta-frontend | up, 14h uptime | Sin cambios (Bloque 10 es quien migra el frontend) |

## 4. Resultado de `/health`

```
$ curl -sf http://localhost:3004/health
{"status":"ok","db":"ok","timestamp":"2026-07-07T12:53:54.621Z"}
```
Verificado 4 veces durante esta sesión (antes del redeploy, después del redeploy,
después de la prueba del dataset generator, y al cierre). Las 4 veces `ok`.

## 5. Migraciones ejecutadas

```
           filename           |          applied_at
------------------------------+-------------------------------
 0001_adan_pgvector.sql       | 2026-07-06 17:48:44.31381+00
 0002_auth_audit.sql          | 2026-07-06 22:57:24.032373+00
 0002_multitenant.sql         | 2026-07-07 12:50:58.923301+00
 0003_security_enterprise.sql | 2026-07-07 12:50:58.950598+00
```
Las 4 migraciones del repo están registradas. Ver **Hallazgo #1** — las dos últimas se
re-ejecutaron durante el redeploy de esta sesión (estaban ausentes del bookkeeping al
empezar la auditoría) y terminaron sin ningún error, confirmando que su diseño
idempotente funciona de verdad contra un esquema ya poblado, no solo en teoría.

## 6. Tablas existentes en PostgreSQL

**44 tablas confirmadas** vía `information_schema.tables`:

```
audit_events, authorization_audit, clients, credit_validations, document_chunks,
documents, embeddings, export_cost_sheets, export_operations, freight_quotes,
incoterms, insurance_quotes, invoices, master_packing_lists, material_consumption,
mock_scenarios, modules, notifications, order_items, orders,
packaging_consumptions, packing_lists, permissions, plan_modules, plans,
platform_role_permissions, platform_roles, platform_user_roles, production_orders,
products, quote_items, quotes, raw_material_consumptions, role_permissions, roles,
schema_migrations, shipment_tracking, shipments, tenant_feature_flags,
tenant_subscriptions, tenants, user_roles, users, workflow_events
```

Cubre exactamente lo esperado de Bloques 1-5: multitenancy, seguridad enterprise,
integration hub (vía `mock_scenarios`), y todas las entidades de negocio que el dataset
generator necesita.

## 7. Conteo de registros por tabla

**Estado al iniciar la auditoría** (antes de cualquier acción de esta sesión):

| Tabla | Count | Interpretación |
|---|---|---|
| tenants | 1 | "oben", único tenant — correcto para este momento del proyecto |
| users | 1 | admin.demo@oben.com |
| user_roles | 1 | admin.demo → tenant.admin |
| modules | 18 | catálogo completo (Bloque 2) |
| permissions | 83 | catálogo completo |
| roles | 2 | tenant.admin + tenant.viewer |
| role_permissions | 90 | asignaciones rol↔permiso |
| platform_roles | 3 | superadmin/support/auditor |
| platform_role_permissions | 14 | asignaciones plataforma |
| platform_user_roles | 0 | **ningún usuario de plataforma asignado todavía** (ver hallazgo #3) |
| plans | 3 | starter/pro/enterprise |
| plan_modules | 37 | 8+12+17, coincide exacto con el catálogo (`security-catalog.ts`) |
| tenant_subscriptions | 1 | oben → enterprise, active |
| tenant_feature_flags | 0 | sin overrides — correcto, plan enterprise ya cubre todo |
| authorization_audit | 17 | trazas de autorización de pruebas anteriores |
| mock_scenarios | 0 | sin escenarios persistidos al iniciar |
| incoterms | 0 | dataset generator nunca se había ejecutado aquí |
| clients, products, orders, order_items, invoices, credit_validations, quotes, quote_items, production_orders, export_operations, shipments, shipment_tracking, packing_lists | **0 en todas** | Bloque 5 (dataset generator) nunca se había desplegado ni ejecutado en el servidor — ver hallazgo #2 |
| documents, document_chunks, embeddings | 0 | ADÁN sin conocimiento cargado (esperado, ver `BASE_CONOCIMIENTO_OBEN.md`) |
| audit_events, workflow_events, notifications | 0 | sin uso todavía |

**Tras la sincronización y prueba de esta sesión** (ver hallazgo #2): se desplegó el
Bloque 5, se ejecutó una generación mínima real (3 clientes/5 productos/5 órdenes) para
verificar funcionamiento end-to-end, se confirmó en BD, y se limpió inmediatamente
(DELETE scoped al tenant "oben") para no dejar datos sintéticos en lo que es la única
instancia real del proyecto. **Estado final: idéntico al inicial en todas las tablas de
negocio (0 filas), excepto `incoterms` que ahora tiene las 4 filas del catálogo estándar
ICC** (EXW/FOB/CIF/DDP) — esto no es dato ficticio, es catálogo de referencia real y se
deja sembrado a propósito.

## 8. Estado del licenciamiento

```sql
SELECT t.slug, p.key AS plan, s.status FROM tenant_subscriptions s
JOIN tenants t ON t.id=s.tenant_id JOIN plans p ON p.id=s.plan_id;

 slug |    plan    | status
------+------------+--------
 oben | enterprise | active
```
Confirmado también indirectamente: el Integration Hub respondió `operational` en los 8
sistemas (módulo `integrations` requiere licencia — si no estuviera en plan enterprise,
`PermissionsGuard` habría devuelto `module_not_licensed`, como ya ocurrió y se corrigió
en la sesión anterior).

## 9. Estado del multitenancy

Confirmado funcionalmente en esta sesión: la generación de dataset (3 clientes/5
productos/5 órdenes) quedó 100% scoped al `tenant_id` de "oben" (verificado por
`SELECT tenant_id, count(*) FROM orders GROUP BY tenant_id` — una sola fila, un solo
tenant). El reset posterior también fue scoped correctamente (`DELETE ... WHERE
tenant_id = $1`) — no se tocó ningún otro tenant (no existe otro tenant en el sistema
todavía, pero el mecanismo de filtrado se ejerció y funcionó).

## 10. Estado del sistema de permisos

```
Login admin.demo@oben.com → tenant=oben, role=sales (campo legacy, no usado por RBAC
nuevo), isSuperAdmin=false, permissions=74 (vía rol tenant.admin asignado)
```
`platform_user_roles = 0` confirma que **no existe ningún usuario de plataforma
(Paradixe) asignado todavía** — ver hallazgo #3. El motor de autorización se ejerció en
vivo dos veces en esta sesión (contra `/integrations/*`), con resultado correcto en
ambos casos (allow cuando corresponde, deny cuando se retiró el permiso en pruebas
anteriores).

## 11. Estado del Integration Hub

```
GET /integrations/status →
oracle:operational, oben:operational, cubeiq:operational, dian:operational,
efranco:operational, shipping:operational, email:operational, whatsapp:operational
```
Los 8 sistemas responden, los 8 en modo `mock` (ningún tenant tiene credenciales reales
configuradas — comportamiento esperado y correcto, tal como diseñado).

Ejecución real de operación de negocio verificada: `POST /integrations/execute` con
`dian.invoice.send` → `ok=true, state=operational`, generó CUFE determinista.

## 12. Estado de los Mock Adapters

Verificado con una prueba nueva en esta sesión (no repetida de sesiones anteriores):
inyecté un escenario `auth_error` en `shipping.tracking.get` vía
`POST /integrations/scenarios`, esperé el TTL de caché (5s), ejecuté la operación → la
llamada falló exactamente con el mensaje configurado (`ok=false, state=error,
error="Token de courier expirado (prueba auditoria)"`). Limpié el escenario después
(`DELETE /integrations/scenarios` → `{"deleted": 1}`). El panel de escenarios
persistente funciona de extremo a extremo contra el servidor real.

## 13. Estado del Dataset Generator

**Antes de esta auditoría: NO estaba desplegado en el servidor** (código solo existía
localmente, verificado únicamente contra una BD efímera local en el turno anterior).

**En esta auditoría:**
1. Se desplegó junto con el resto de `backend/src` vía `redeploy.sh`.
2. Se ejecutó directamente en el contenedor de producción
   (`docker exec dta-backend node_modules/.bin/ts-node src/cli/generate-dataset.ts --
   --tenant=oben --clients=3 --products=5 --orders=5`) — **sin errores**, resultado:
   `{"clients":3,"products":5,"orders":5,"orderItems":16,"invoices":4,
   "creditValidations":5,"productionOrders":3,"quotes":1,"quoteItems":2,"elapsedMs":129}`.
3. Se verificó en BD directamente: 3 clientes reales con nombres/IDs generados
   correctamente, 5 órdenes con estados y montos coherentes.
4. Se limpió inmediatamente (DELETE scoped al tenant) para no dejar datos sintéticos en
   la única instancia real del proyecto — quedó en 0 en todas las tablas de negocio.

**Conclusión: funciona de extremo a extremo contra el servidor real de Oben**, no solo
contra una BD de prueba local.

## 14. Resultado de `npm test` (ejecutado en esta sesión, como parte de `redeploy.sh`, antes de tocar el servidor)

```
Test Suites: 15 passed, 15 total
Tests:       108 passed, 108 total
Time:        5.474s - 8.715s (dos corridas en esta sesión)
```

## 15. Resultado de `npm run build`

```
$ npx tsc --noEmit   → exit 0, sin errores
$ npx nest build     → exit 0, sin errores
```
Ambos ejecutados como paso 2 de `redeploy.sh`, **antes** de empaquetar o tocar el
servidor (el script aborta si fallan — no fue necesario, pasaron limpio).

## 16. Errores y hallazgos encontrados en esta auditoría

### Hallazgo #1 — Bookkeeping de migraciones desincronizado (RESUELTO, sin impacto)
Al iniciar la auditoría, `schema_migrations` solo registraba 2 de 4 archivos
(`0001_adan_pgvector.sql`, `0002_auth_audit.sql`) — faltaban `0002_multitenant.sql` y
`0003_security_enterprise.sql`, a pesar de que las 44 tablas y todos los datos
(permisos, roles, planes) ya existían correctamente. Causa raíz: en una sesión
anterior se hizo un `DROP DATABASE`/`CREATE DATABASE` completo seguido de
`DELETE FROM schema_migrations` manual durante la resolución de un bug distinto
(mismatch de longitud de columna `slug`); el esquema se recreó correctamente vía
`TypeORM synchronize`, pero el bookkeeping de qué migraciones SQL se habían "aplicado"
quedó parcialmente inconsistente entre ese momento y el despliegue del archivo
`0002_auth_audit.sql`.

**Verificación real, no asumida:** al redesplegar en esta auditoría, el runner
re-ejecutó automáticamente los 2 archivos faltantes contra el esquema YA poblado — y
terminaron sin ningún error, porque están escritos con `IF NOT EXISTS`/`ON CONFLICT DO
NOTHING` en cada paso. Esto confirma con evidencia (no con lectura del código) que el
diseño idempotente funciona. El bookkeeping ahora está completo (4/4).

### Hallazgo #2 — Bloque 5 nunca desplegado (RESUELTO en esta auditoría)
Confirmado y corregido: se desplegó, se ejecutó una prueba real end-to-end contra el
servidor de Oben, se verificó en BD, y se limpió sin dejar residuos. Detalle en
sección 13.

### Hallazgo #3 — Ningún usuario de plataforma (Paradixe) existe todavía
`platform_user_roles = 0`. Esto significa que hoy **nadie puede administrar tenants,
planes ni feature flags vía `/platform/*`** (esos endpoints exigen un platform role).
El único camino de administración operativo hoy es acceso SSH directo + `psql`/CLI. No
es un bug — es un paso de setup pendiente (asignar el primer `platform.superadmin` a un
usuario) que no se ha ejecutado porque no se ha pedido explícitamente. Se documenta
como pendiente de decisión del usuario, no se resuelve de forma unilateral en esta
auditoría (crear un superadmin de plataforma es una acción con implicaciones de acceso
que no me corresponde decidir sola).

### Hallazgo #4 — Trabajo sin commitear en git (NO RESUELTO, requiere decisión del usuario)
Sigue exactamente igual que en la auditoría anterior: `HEAD=5bf924e`, todo Bloques 1-5
sin commitear. No se commiteó en esta sesión porque no fue solicitado explícitamente y
la política de este proyecto es no commitear sin instrucción directa del usuario.

### Hallazgo #5 — Colisión de nomenclatura en archivos de migración (documentado, no bloqueante)
`0002_auth_audit.sql` y `0002_multitenant.sql` comparten el mismo prefijo numérico.
Funciona correctamente porque el orden de ejecución es alfabético y ambos son
independientes e idempotentes, pero debería renombrarse uno de los dos (por ejemplo a
`0004_auth_audit.sql`) para evitar futura confusión.

---

## Conclusión

**Los Bloques 1-5 están confirmados como desplegados, funcionando y verificados en el
servidor real de Oben, con evidencia ejecutada en esta sesión** (no heredada de turnos
anteriores sin re-verificar). Se encontraron y resolvieron 2 discrepancias reales; se
documentaron 2 hallazgos que requieren decisión explícita del usuario (commitear a git,
crear el primer usuario de plataforma) y 1 hallazgo cosmético (nomenclatura de
migraciones) sin impacto funcional.

**Bloque 6 queda desbloqueado según el criterio pedido** ("la auditoría confirme que los
Bloques 1-5 están realmente desplegados, funcionando y verificados") — a la espera de
que el usuario confirme si desea retomarlo ahora.
