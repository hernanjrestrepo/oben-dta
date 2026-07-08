# Manual de Integraciones — DTA Oben

> Manual técnico del Integration Hub: cómo está construido, cómo se comporta, y cómo se activa.
> Para el estado y requerimientos pendientes ver `REQUERIMIENTOS_OBEN.md` y
> `CHECKLIST_INTEGRACIONES.md`. Para la matriz de endpoints por sistema ver
> `MATRIZ-INTEGRACIONES.md`. **Congelado**: no se modifica este módulo en esta fase.

## 1. Principio de diseño: degradación honesta
El Integration Hub **nunca inventa datos**. Cada llamada pasa primero por
`IntegrationClient.isConfigured()` (`backend/src/modules/integrations/common/integration-client.ts`):
si falta la base URL o las credenciales mínimas para el `authScheme` del sistema, la llamada
devuelve inmediatamente `state: 'pendiente_credenciales'` sin intentar red. Si está configurado
pero el sistema externo falla o responde error HTTP, el estado es `incompleta` (nunca se
disfraza un fallo como éxito). Solo si la llamada real tiene éxito el estado es `operativa`.

Toda llamada queda auditada (`logger.log`) con sistema, endpoint, estado HTTP y duración —
trazabilidad de cada intento, configurado o no.

## 2. Arquitectura común
- `common/integration.types.ts`: tipos compartidos (`IntegrationName`, `IntegrationConfig`,
  `IntegrationApiState = 'operativa' | 'incompleta' | 'pendiente_credenciales'`,
  `IntegrationCallResult<T>`).
- `common/integration-client.ts`: clase abstracta `IntegrationClient` — auth, llamada HTTP con
  timeout (`15000ms` default), parseo de respuesta, auditoría. Cada sistema extiende esta clase.
- `integrations.service.ts`: agrega el estado de los 3 sistemas para `/integrations/status`.
- `integrations.controller.ts`: expone los endpoints (todos `GET` salvo SuiteQL).

## 3. VETA (`veta/veta.service.ts`)
- Auth: `api_key` — header configurable (`VETA_API_KEY_HEADER`, default `x-api-key`).
- 6 APIs de lectura mapeadas: `APIVendorImportDate`, `APIItemsImportDate`,
  `APIPurchOrdImportDate`, `APIPurchOrdImportSel`, `APIItemRcptDate`, `APIItemRcptPurchOrder`.
- Endpoints DTA expuestos: `GET /integrations/veta/vendors`, `/veta/items`,
  `/veta/purchase-orders`, `/veta/receipts`.
- Pendiente real de Oben: base URL, API key, contrato exacto de query params y esquema de
  response (los mappers están escritos sobre un esquema asumido, deben validarse contra la
  respuesta real).

## 4. NetSuite (`netsuite/netsuite.service.ts`)
- Auth: `oauth1_tba` — Token-Based Authentication real, firma HMAC-SHA256.
  - `buildOAuthHeader()`: construye el header `Authorization: OAuth ...` con
    `oauth_consumer_key`, `oauth_token`, `oauth_signature_method=HMAC-SHA256`, `oauth_timestamp`,
    `oauth_nonce`, `oauth_version`, `oauth_signature`.
  - `rfc3986()`: encoding estricto requerido por la especificación OAuth 1.0a (distinto de
    `encodeURIComponent` en algunos caracteres).
- Endpoint expuesto: `POST /integrations/netsuite/suiteql` (ejecuta una consulta SuiteQL de
  solo lectura).
- Pendiente real de Oben: `NETSUITE_ACCOUNT_ID` + las 4 credenciales TBA, y confirmar que el rol
  de integración tiene permiso de SuiteQL sobre las tablas requeridas.
- La lógica de firma está implementada y no probada contra una cuenta real — la primera prueba
  con credenciales reales es la validación pendiente.

## 5. Armstrong (`armstrong/armstrong.service.ts`)
- Auth: `bearer` simple.
- **Es el sistema con mayor incertidumbre**: no hay documentación de la API entregada por Oben
  todavía, por lo que los endpoints reales podrían no coincidir con la implementación actual.
- Pendiente real de Oben: documentación completa de la API (prioridad sobre las credenciales
  mismas, porque sin contrato no se puede validar nada).

## 6. Cómo se activa un sistema (procedimiento técnico)
1. Cargar las variables del sistema en el `.env` del servidor (ver `INVENTARIO_VARIABLES_ENV.md`
   para la lista exacta por sistema).
2. `docker compose -f docker/docker-compose.yml up -d backend` (recrea el contenedor con las
   nuevas variables).
3. `GET /integrations/status` → el sistema debe pasar de `pendiente_credenciales` a
   `configured: true` (esto solo confirma que `isConfigured()` es verdadero, no que la llamada
   real funcione).
4. Probar una llamada real de lectura. Si el `state` resultante es `incompleta`, revisar:
   - credenciales incorrectas o vencidas,
   - base URL incorrecta,
   - el sistema externo no es alcanzable desde el servidor (red/VPN/firewall del lado de Oben),
   - el esquema de response real no coincide con el mapper (ajustar mapper, no forzar datos).
5. Una vez `operativa` de forma consistente, reclasificar en `MATRIZ-INTEGRACIONES.md`.

## 7. Escritura (no implementada — a propósito)
El Hub es **100% lectura** por diseño actual. No existe ningún método de creación/actualización
hacia VETA, NetSuite o Armstrong. Antes de implementar escritura se requiere (en este orden):
payloads de escritura validados contra documentación oficial → pruebas controladas (sandbox si
existe) → aprobación explícita de Oben → plan de rollback documentado por sistema. Ninguno de
estos cuatro requisitos está satisfecho hoy.

## 8. Referencias
`REQUERIMIENTOS_OBEN.md`, `CHECKLIST_INTEGRACIONES.md`, `MATRIZ-INTEGRACIONES.md`,
`INVENTARIO_VARIABLES_ENV.md`, `INVENTARIO_ENDPOINTS.md`.
