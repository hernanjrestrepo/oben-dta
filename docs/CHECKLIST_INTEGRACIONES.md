# Checklist de Integraciones — DTA Oben

> Estado al 2026-06-23: Integration Hub construido y desplegado, **todas en modo lectura**,
> todas en `pendiente_credenciales`. No se activa ninguna integración real sin credenciales
> oficiales de Oben. Ver detalle completo en `REQUERIMIENTOS_OBEN.md` y `MATRIZ-INTEGRACIONES.md`.

## VETA (proveedores / compras)
- [ ] Recibir `VETA_BASE_URL` de Oben.
- [ ] Recibir `VETA_API_KEY` + nombre real del header (`VETA_API_KEY_HEADER`).
- [ ] Recibir contrato exacto de query params (`date`, `po`) por endpoint.
- [ ] Recibir esquema real de response JSON (para validar mappers ya construidos).
- [ ] Confirmar si existe sandbox/QA o solo producción.
- [ ] Cargar variables en `.env` del servidor → `docker compose up -d backend`.
- [ ] `GET /integrations/status` → VETA debe pasar a `configured:true`.
- [ ] Probar una llamada real por cada uno de los 6 endpoints de lectura (`APIVendorImportDate`, `APIItemsImportDate`, `APIPurchOrdImportDate`, `APIPurchOrdImportSel`, `APIItemRcptDate`, `APIItemRcptPurchOrder`).
- [ ] Ajustar mappers si el response real difiere del esquema asumido.
- [ ] Reclasificar en `MATRIZ-INTEGRACIONES.md`: `pendiente_credenciales` → `operativa`.

## NetSuite (SuiteQL — lectura)
- [ ] Recibir `NETSUITE_ACCOUNT_ID`.
- [ ] Recibir `NETSUITE_CONSUMER_KEY` / `NETSUITE_CONSUMER_SECRET` (app TBA).
- [ ] Recibir `NETSUITE_TOKEN_ID` / `NETSUITE_TOKEN_SECRET` (usuario de integración).
- [ ] Confirmar que el rol del usuario de integración tiene permiso de SuiteQL sobre las tablas requeridas.
- [ ] Confirmar si hay sandbox de NetSuite disponible para pruebas.
- [ ] Cargar variables en `.env` del servidor → `docker compose up -d backend`.
- [ ] `GET /integrations/status` → NetSuite debe pasar a `configured:true`.
- [ ] Probar `POST /integrations/netsuite/suiteql` con una consulta real de bajo riesgo.
- [ ] Validar firma OAuth 1.0a TBA contra la respuesta real (la lógica de firma ya está implementada en `netsuite.service.ts`, falta solo validarla contra cuenta real).
- [ ] Reclasificar en `MATRIZ-INTEGRACIONES.md`.

## Armstrong (producción / logística)
- [ ] **Recibir documentación completa de la API** (hoy es el bloqueo principal — no hay contrato de endpoints).
- [ ] Recibir `ARMSTRONG_BASE_URL`.
- [ ] Recibir `ARMSTRONG_TOKEN` (bearer).
- [ ] Confirmar formato de auth real (¿bearer simple, o expira y requiere refresh?).
- [ ] Cargar variables en `.env` del servidor → `docker compose up -d backend`.
- [ ] `GET /integrations/status` → Armstrong debe pasar a `configured:true`.
- [ ] Probar al menos una llamada de lectura real; ajustar `armstrong.service.ts` según el contrato real recibido (hoy es el módulo con menos certeza porque no hay spec).
- [ ] Reclasificar en `MATRIZ-INTEGRACIONES.md`.

## Transversal (las 3 integraciones)
- [ ] Confirmar política de rate limiting / ventanas horarias por sistema antes de probar en producción.
- [ ] Ejecutar las pruebas de lectura en una ventana controlada, con aprobación explícita.
- [ ] Documentar resultado de cada prueba (request/response real) como evidencia.
- [ ] Actualizar `MATRIZ-INTEGRACIONES.md` y `REPORTE_CIERRE_PREINTEGRACIONES.md` con el nuevo estado.

## Escritura en producción (NO antes de esto)
- [ ] Payloads de escritura validados contra documentación oficial de cada sistema.
- [ ] Pruebas controladas en sandbox (si existe) o ventana acotada en producción.
- [ ] Aprobación explícita de Oben para habilitar escritura.
- [ ] Plan de rollback documentado por sistema antes de activar cualquier escritura.
- [ ] Solo entonces: implementar los métodos de escritura (hoy el Hub es 100% lectura por diseño).

## Regla general
Ningún ítem de este checklist se marca como hecho sin evidencia ejecutada (request/response
real, captura o log). Mientras falte cualquier credencial, el sistema correspondiente permanece
en `pendiente_credenciales` — comportamiento esperado, no un error.
