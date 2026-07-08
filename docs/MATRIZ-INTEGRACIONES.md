# Matriz de Integraciones — DTA Oben (Integration Hub)

> Fecha: 2026-06-22 · SOLO LECTURA. Escritura en producción deshabilitada por diseño.
> Estado verificado por código desplegado y prueba ejecutada (degradación a
> `pendiente_credenciales` confirmada sin inventar datos).

## Arquitectura común (Fase 1 — construida)

Cada sistema (NetSuite, VETA, Armstrong) usa la misma base:
`Auth · Client · DTO · Mapper · Logger · Audit` → `IntegrationClient` + `IntegrationsService`.
Sin base URL/credenciales, cada API devuelve `pendiente_credenciales` (no fabrica datos).

## Matriz de APIs

| API | Sistema | Método | Autenticación | Payload | Response | Estado |
|---|---|---|---|---|---|---|
| APIVendorImportDate | VETA | GET `?date=` | API key (header) | `date` | lista proveedores → `VendorDTO[]` | 🟡 Pendiente credenciales |
| APIItemsImportDate | VETA | GET `?date=` | API key | `date` | lista ítems → `ItemDTO[]` | 🟡 Pendiente credenciales |
| APIPurchOrdImportDate | VETA | GET `?date=` | API key | `date` | OC → `PurchaseOrderDTO[]` | 🟡 Pendiente credenciales |
| APIPurchOrdImportSel | VETA | GET `?po=` | API key | `poNumber` | OC seleccionada | 🟡 Pendiente credenciales |
| APIItemRcptDate | VETA | GET `?date=` | API key | `date` | recepciones → `ReceiptDTO[]` | 🟡 Pendiente credenciales |
| APIItemRcptPurchOrder | VETA | GET `?po=` | API key | `poNumber` | recepciones por OC | 🟡 Pendiente credenciales |
| SuiteQL Query | NetSuite | POST `/query/v1/suiteql` | OAuth 1.0a TBA (HMAC-SHA256) | `{ q: "SELECT ..." }` | filas SuiteQL | 🟡 Pendiente credenciales |
| (endpoints a definir) | Armstrong | GET | Bearer | — | — | 🔴 Pendiente documentación |

### Clasificación
- **Operativa:** 0 — (ninguna probada con respuesta real aún)
- **Incompleta:** 0
- **Pendiente credenciales:** 7 (VETA ×6 + NetSuite SuiteQL) — código y firma OAuth listos
- **Pendiente documentación:** Armstrong — falta el contrato de endpoints

## Herramientas creadas

### EVA (Fase 3 — construidas y despachables)
`GetVendors`, `GetItems`, `GetPurchaseOrders`, `GetReceipts`, `RunSuiteQL`
→ definidas en `EVA_INTEGRATION_TOOLS`, ejecutables vía `executeTool`. Set separado
del flujo de órdenes para no degradar al modelo 3b en el order-to-cash.

### ADÁN (Fase 4 — arquitectura lista)
`IntegrationsService` es inyectable en ADÁN para responder sobre proveedores,
artículos, órdenes e inventario. Bloqueado en credenciales: sin datos reales,
ADÁN no responderá ERP (por diseño no inventa).

## Qué se necesita de Oben para pasar a "Operativa"

| Variable de entorno | Sistema | Qué es |
|---|---|---|
| `VETA_BASE_URL` | VETA | host base de las APIs |
| `VETA_API_KEY` (+ `VETA_API_KEY_HEADER`) | VETA | credencial de lectura |
| `NETSUITE_ACCOUNT_ID` | NetSuite | account id (deriva el host SuiteTalk) |
| `NETSUITE_CONSUMER_KEY` / `_SECRET` | NetSuite | app TBA |
| `NETSUITE_TOKEN_ID` / `_SECRET` | NetSuite | token TBA del usuario de integración |
| `ARMSTRONG_BASE_URL` / `ARMSTRONG_TOKEN` | Armstrong | host + bearer (+ contrato de endpoints) |

Al cargar estas variables y reiniciar el backend, cada API pasa automáticamente
de `pendiente_credenciales` a `operativa` / `incompleta` según la primera respuesta real.

## Política de escritura (no negociable)
La escritura en producción permanece deshabilitada hasta tener: **payloads validados,
pruebas controladas, aprobación explícita y rollback documentado.** El Hub hoy solo
expone lectura.
