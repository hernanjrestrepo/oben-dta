# Evidencia de Pruebas — Cierre de WO-013

Fecha de la evidencia: 2026-07-14. Todas las pruebas de este documento se ejecutaron y verificaron en vivo durante la ejecución de WO-013 — ninguna es proyectada ni asumida.

## 1. Suite de tests unitarios/funcionales (backend)

```
Test Suites: 18 passed, 18 total
Tests:       141 passed, 141 total
Snapshots:   0 total
Time:        5.11 s
```

Cobertura relevante: `licensing.service.spec.ts` (13 tests — emisión, renovación, revocación, tampering de `expiresAt`/`maxUsers`, período de gracia, fingerprint de instalación, compatibilidad retroactiva de licencias sin fingerprint, auditoría de eventos de licencia), `authorization.service.spec.ts`, `permissions.guard.spec.ts`, `auth.service.spec.ts`, `tenant-context.service.spec.ts`, `tenant.interceptor.spec.ts`, entre otras.

## 2. Type-checking

```
backend:  npx tsc --noEmit   → sin errores
frontend: npx tsc --noEmit   → sin errores
```

## 3. Build de producción

```
frontend: npm run build → "Compiled successfully", 24 rutas generadas
          (dashboard, quotes, orders, invoices, clients, auditoria,
           admin/users, admin/roles, platform/*, login, operaciones)
```

## 4. Validación de Docker

- `docker compose build backend` y `docker compose build frontend` completan sin error.
- Contenedores `dta-backend`, `dta-postgres`, `dta-redis` corriendo y en estado `healthy` de forma sostenida.
- Imagen `docker-frontend:latest` verificada de forma independiente (contenedor de un solo uso en puerto alternativo, ya que el puerto 3000 del host está ocupado por un proyecto local no relacionado): arranca en 237 ms y responde `200` en `/login`.

## 5. Flujo comercial completo — verificación en vivo

Ejecutado dos veces contra el backend real (vía navegador y vía llamadas HTTP directas):

- Correo → cliente nuevo creado → cotización generada → PDF generado → correo de respuesta enviado (simulador) → aprobación simulada → link de pago → pago confirmado → **Orden real creada** → **Factura real creada** → producción → listo para despacho → **Entregado**.
- Verificado directamente en Postgres: la orden alcanza estado `DELIVERED`, la factura tiene montos correctos (`amount` + 19% IVA = `totalAmount`), y cada paso queda registrado en `workflow_events` bajo el flujo `quote-to-cash`.
- Verificado en el frontend: la orden generada por la demo se ve en `/orders/:id` con estado "Entregada", cliente y producto correctos.

## 6. Concurrencia — reproducción y corrección de 2 bugs reales

Durante la prueba del botón "Ejecutar demo" se dispararon accidentalmente dos ejecuciones simultáneas del flujo (React Strict Mode en desarrollo), lo que expuso dos condiciones de carrera preexistentes:

1. **Numeración de facturas no atómica** (`InvoicesService.generateInvoiceNumber`): dos pagos casi simultáneos podían calcular el mismo número de factura. Reproducido, corregido con reintento acotado ante colisión de restricción única, y **re-verificado con dos llamadas `POST /demo/run` lanzadas en paralelo por `curl`**: ambas completaron exitosamente con números de factura consecutivos y distintos (`INV-20260714-0084` / `INV-20260714-0085`).
2. **Descuento de stock no atómico** (`simulatePayment`): dos decrementos concurrentes sobre el mismo SKU podían perderse (lost update). Reproducido (2+2 unidades colapsaron en un único decremento de 2), corregido reemplazando el patrón leer-restar-guardar por `Repository.decrement()` (atómico en Postgres), y **re-verificado**: dos decrementos concurrentes de 2 unidades cada uno dejaron el stock exactamente en `-4` respecto al valor inicial.

Ambas correcciones quedaron cubiertas por la suite de tests (141/141 sigue en verde tras el fix) y verificadas contra el backend real, no solo en mocks.

## 7. RBAC y licenciamiento — verificación funcional

- Login con `admin@oben.com` devuelve JWT con el arreglo completo de permisos correspondiente a sus roles asignados y el estado de licencia (`valid: true`) embebido en la respuesta.
- `GET /auditoria` requiere y respeta el permiso `auditoria.read`; devolvió `403 module_not_licensed` hasta que los módulos `auditoria`/`configuracion`/`licencias` se agregaron a los planes (bug real encontrado y corregido durante el Sprint 4 de este work order).
- Backward-compatibility de licenciamiento verificada contra el tenant real "oben": tras desplegar el cambio de fingerprint de instalación, su licencia (`installation_fingerprint = NULL`, emitida antes del cambio) siguió validando `valid: true` — confirmado directamente en Postgres y vía `GET /license/status`.

## 8. Limpieza de datos de prueba

Se auditó la base de datos en busca de residuos de prueba y se eliminaron: una orden de prueba histórica (`ORD-TEST-AUDIT-001`, sin factura asociada) y un usuario de prueba (`refreshtest@oben.com`) de una sesión anterior de hardening de autenticación. Todo dato de prueba generado **durante la verificación de WO-013** (clientes, cotizaciones, órdenes, facturas y eventos de auditoría de las pruebas de la demo y de concurrencia) fue revertido inmediatamente después de cada verificación, incluyendo la restauración exacta del stock de producto afectado.

## 9. Búsqueda de código muerto / TODOs / placeholders

`grep` recursivo sobre `backend/src` y `frontend/src` no encontró marcadores `TODO`/`FIXME`/`HACK` reales (dos falsos positivos correspondían a la palabra "TODOS" en español dentro de comentarios). No se encontraron `console.log`/`debugger` de depuración fuera de scripts CLI legítimos que imprimen su salida intencionalmente por diseño.
