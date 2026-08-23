# Security Review — RC1 (WO-018 Sprint 5)

**Fecha:** 2026-07-30 / addendum 2026-07-31 · **Rama:** `sprint2-customer-core` · **Metodología:** ofensiva — explotación real contra el contenedor `dta-backend` en ejecución (no solo revisión de código), con evidencia HTTP/DB verificable en cada caso.

**Pregunta guía:** *"Si yo fuera un atacante, ¿cómo intentaría comprometer Oben Plus?"*

> **Addendum 2026-07-31:** tras la revisión del usuario, se añadió evaluación de Rate Limiting/fuerza bruta (con explotación real) y una auditoría de logs en busca de fuga de credenciales/PII, más el Apéndice "Aspectos no evaluados en RC1". Este addendum encontró y corrigió un hallazgo adicional (HIGH-3, configuración de entorno).

## Resumen ejecutivo

| Severidad | Cantidad | Estado |
|---|---|---|
| **Critical** | 0 | — |
| **High** | 3 | ✅ Corregidas |
| **Medium** | 1 | ✅ Corregida |
| **Low / Informativo** | 4 | Documentadas (3 aceptadas por diseño, 1 pendiente de limpieza menor) |

Ninguna vulnerabilidad Critical. Las tres High (XSS en correos, SSRF en el Integration Hub, configuración `NODE_ENV` exponiendo hashes en logs y arriesgando pérdida de datos) fueron confirmadas explotándolas o reproduciéndolas de verdad contra el contenedor real, corregidas, cubiertas con tests o verificación en vivo, y re-verificadas tras el fix. La Medium (DocumentFlowEngine con excepción sin capturar) también fue reproducida, corregida y re-verificada.

Esta revisión **no se limitó a leer código**: cada hallazgo de esta lista fue efectivamente disparado contra `http://localhost:3004` (o contra la base de datos real cuando el vector lo requería), con el request/respuesta real documentado.

---

## Hallazgos

### [HIGH-1] XSS (HTML Injection) en correos generados por el sistema

**Descripción.** Las plantillas de correo (`email-templates.ts`) interpolaban directamente, sin escapar, valores no confiables: el campo `from` de la solicitud entrante (100% controlado por quien envía el correo), el nombre del cliente y el nombre/SKU del producto.

**Riesgo.** Cualquiera que envíe un correo de "solicitud de cotización" (`POST /quotes/email`, permiso `quotes.create` — el más bajo del sistema, pensado justamente para procesar remitentes externos arbitrarios) puede inyectar HTML/JavaScript en el correo HTML que el sistema genera y en la respuesta de `GET /quotes/inbox/emails`. Si ese HTML llega a renderizarse en un cliente de correo o vista de vista previa sin sandboxing, permite phishing visual, robo de sesión (si algún visor ejecuta script) o suplantación del contenido del correo.

**Cómo se reprodujo.**
```bash
curl -X POST http://localhost:3004/quotes/email -H "Authorization: Bearer <token>" \
  -d '{"from":"<script>alert(document.cookie)</script>@evil.com","subject":"test","body":"test"}'
curl http://localhost:3004/quotes/inbox/emails | grep "<script>"
# → <script>alert(document.cookie)</script>   (sin escapar, confirmado)
```

**Evidencia.** Respuesta real del servidor conteniendo el tag `<script>` sin ninguna transformación, capturada en esta sesión.

**Código afectado.** `backend/src/modules/quotes/email-templates.ts` — `renderUnknownClientEmail()`, `renderInsufficientInfoEmail()`, `renderQuoteResponseEmail()`.

**Corrección aplicada.** Función `escapeHtml()` aplicada a **todo** valor interpolado en las tres plantillas (`from`, `clientName`, `quote.client.name`, `item.product.name`, `item.product.sku`, `quote.quoteNumber`) — se escapó también lo que hoy es dato interno (SKU, nombre de producto) porque no vale la pena razonar caso por caso qué es "seguro".

**Estado.** ✅ Corregido. Test de regresión: `email-templates.spec.ts` (3 casos, payload `<script>` verificado como neutralizado en las 3 plantillas). Re-verificado en vivo tras el fix (ya no se refleja el script).

---

### [HIGH-2] SSRF en el Integration Hub (adaptadores reales)

**Descripción.** `RealAdapterBase.httpJson()` (usado por `GenericHttpRealAdapter`, el adaptador real genérico para VETA/Armstrong/cualquier sistema REST) hacía `fetch(baseUrl + path)` sin ninguna validación del host. `baseUrl` se configura por tenant en `tenant.integrationConfig.<sistema>.baseUrl`.

**Riesgo.** Con `platform.tenants.manage` (para configurar `baseUrl` una vez) y `integrations.read` (para disparar la llamada — un permiso mucho más bajo, plausible en muchos roles) vía `POST /integrations/execute`, el servidor puede usarse como proxy para alcanzar direcciones IP privadas/internas, incluyendo el propio backend, otros contenedores de la red, o (en un despliegue cloud real) el endpoint de metadata de la nube (`169.254.169.254`) — vector clásico de robo de credenciales de infraestructura.

**Cómo se reprodujo.**
```sql
UPDATE tenants SET integration_config =
  '{"veta":{"mode":"real","baseUrl":"http://172.19.0.5:3004","authScheme":"none",
    "routes":{"probe":{"path":"/health","method":"GET"}}}}'::jsonb WHERE slug='oben';
```
```bash
curl -X POST http://localhost:3004/integrations/execute -H "Authorization: Bearer <token>" \
  -d '{"system":"veta","operation":"probe","args":{}}'
# ANTES del fix → 200 OK con {"status":"ok","db":"ok",...} — el propio /health del backend,
#                 alcanzado vía la IP interna de la red docker (172.19.0.5, la IP real del contenedor).
```

**Evidencia.** Respuesta real `{"ok":true,"state":"operational","data":{"status":"ok","db":"ok",...}}` obtenida apuntando `baseUrl` a la IP interna del propio contenedor `dta-backend` — confirma que el servidor hizo la petición saliente sin ninguna restricción.

**Código afectado.** `backend/src/modules/integrations/hub/real-adapter-base.ts` — `httpJson()`.

**Corrección aplicada.** Función `assertSafeUrl()` que bloquea por defecto: loopback (`127.0.0.0/8`, `::1`, `localhost`), link-local/metadata de nube (`169.254.0.0/16`), y los tres rangos RFC1918 completos (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), más `0.0.0.0`.

**Decisión de alcance documentada:** no se bloquean rangos privados como excepción configurable por tenant — si el Oracle/ERP real de Oben vive en una IP privada alcanzable solo desde el servidor, activar ese caso puntual es una decisión de despliegue explícita, no un default abierto.

**Limitación conocida (riesgo residual, no resuelto en RC1):** la validación es textual sobre IPs literales — un hostname que no sea una IP literal (ej. un alias DNS interno) y que resuelva a una IP privada en el momento de conectar (DNS rebinding) no queda cubierto. Cerrarlo requeriría resolver DNS y validar la IP resuelta antes de conectar.

**Estado.** ✅ Corregido para IPs literales (el vector confirmado). Test de regresión: `generic-http.real.spec.ts` (10 casos: 8 destinos bloqueados incluyendo los límites exactos del rango 172.16-172.31, 1 host externo legítimo permitido, 1 caso límite 172.32.x fuera de rango correctamente permitido). Re-verificado en vivo: el mismo ataque que antes devolvía 200 ahora devuelve `ssrf_blocked`.

---

### [HIGH-3] `NODE_ENV=development` en el ambiente real del piloto — hash de contraseñas en logs + riesgo de pérdida de datos por `synchronize`

**Descripción.** El `docker/.env` real usado para levantar el piloto de Oben (no un `.env` de ejemplo — el archivo efectivamente cargado por `docker-compose` para `dta-backend`) tenía `NODE_ENV=development`. Dos comportamientos de `app.module.ts` dependen de esa variable:

```ts
synchronize: config.get('NODE_ENV') !== 'production',   // true en development
logging: config.get('NODE_ENV') === 'development',      // true en development
```

**Riesgo.**
1. **Fuga de credenciales en logs (confidencialidad):** con `logging: true`, TypeORM escribe en stdout cada sentencia SQL **con sus parámetros reales**. Cualquier `INSERT`/`UPDATE` sobre `users` incluye el **hash bcrypt de la contraseña** en texto plano en el log. Quien tenga acceso a `docker logs` (u a cualquier sistema de agregación de logs que los recolecte a futuro) puede extraer hashes para intentar crackeo offline, sin necesidad de acceso a la base de datos.
2. **Riesgo de pérdida de datos (integridad/disponibilidad):** con `synchronize: true`, TypeORM **altera automáticamente el esquema real de la base de datos** para que coincida con las entidades en cada arranque del contenedor. Contra una base de datos con datos reales del piloto, un cambio de entidad no cuidadosamente migrado (columna renombrada/eliminada, tipo cambiado) puede alterar o **perder datos de producción silenciosamente** en el próximo despliegue — sin pasar por una migración revisada.

**Cómo se reprodujo.**
```bash
docker exec dta-backend printenv NODE_ENV   # → development
```
```bash
curl -X POST http://localhost:3004/auth/register -H "Content-Type: application/json" \
  -d '{"email":"logtest_...@test.com","password":"SuperSecret123!","firstName":"Log","lastName":"Test","tenantSlug":"oben"}'
# mientras se capturaba `docker logs -f dta-backend` en paralelo
```

**Evidencia.** Línea real capturada de `docker logs dta-backend` durante el registro de un usuario de prueba:
```
query: INSERT INTO "users"(..., "email", "passwordHash", ...) VALUES (...)
  -- PARAMETERS: [..., "logtest_...@test.com",
     "$2b$12$UQYK22Zso9OR8WE0FlNN7OoF/wjxKgEy21O.7y9UOMeAQfClSmmPy", ...]
```
El hash bcrypt completo queda expuesto en el log. La contraseña en texto plano **no** aparece (el hashing ocurre en la aplicación antes del `INSERT`), pero el hash sí, y es el insumo exacto para un ataque de fuerza bruta offline.

**Código afectado.** `backend/src/app.module.ts` (líneas 131-132) — el código en sí es correcto (deriva de `NODE_ENV` como es esperable); el problema real es el **valor de `NODE_ENV` en el ambiente del piloto**, en `docker/.env`.

**Corrección aplicada.**
1. `docker/.env`: `NODE_ENV=development` → `NODE_ENV=production`.
2. Redeploy: `docker compose up -d backend` (contenedor recreado).
3. Verificado en vivo tras el fix:
   - `docker exec dta-backend printenv NODE_ENV` → `production`.
   - 3 requests consecutivos a `/health` ya **no** generan ninguna línea `query: ...` en los logs (antes de esta prueba, un simple health-check generaba `query: SELECT 1` en cada request).
   - `LicenseSigningService` cargó correctamente las claves persistentes de `docker/.env` (`keyId=paradixe-2026-07-08`) — confirma que las claves `LICENSE_SIGNING_*` ya estaban correctamente configuradas para producción y el arranque en modo estricto no rompe nada.
   - Integridad de datos verificada post-recreate: mismos conteos de `tenants`/`users`/`quotes` antes y después (el volumen de Postgres es independiente del contenedor de la app, pero se verificó explícitamente dado que `docker compose` también recreó `dta-postgres` al detectar el cambio en `.env`).
   - `/health` → `{"status":"ok","db":"ok",...}` tras el redeploy.

**Nota relacionada (no corregida, de menor severidad):** `JWT_SECRET` (`dta_test_jwt_secret_min_32_chars_long_enough`) y `DB_PASSWORD` (`dta_test_pass_2026`) en el mismo `docker/.env` tienen apariencia de valores de prueba/desarrollo, no de secretos generados para un ambiente con datos reales de un piloto comercial. No se rotaron en este addendum (requiere coordinación: rotar `JWT_SECRET` invalida todas las sesiones activas) — se deja documentado como recomendación para antes de escalar el piloto más allá de la fase actual.

**Estado.** ✅ Corregido y re-verificado en vivo (`NODE_ENV=production` activo en el ambiente real del piloto).

---

### [MEDIUM-1] `DocumentFlowEngine` — excepción sin capturar ante `DocumentSource` no registrado (DoS controlado)

**Descripción.** `DocumentSourceRegistry.resolve()` lanzaba una excepción síncrona (`throw new Error(...)`) cuando el `source` de un documento requerido no existía — a diferencia de `ActionExecutorRegistry`/`ValidatorRegistry`, que ya devolvían `undefined` de forma controlada para el mismo caso. `document-flow.engine.ts` no envolvía esa llamada en try/catch.

**Riesgo.** Una `DocumentFlowRule` con un `source` inválido (dato jsonb, no verificable en compilación — puede llegar corrupto, mal migrado, o insertado directamente en BD) tira abajo con **HTTP 500** cualquier request que dispare ese evento, para **todo el tenant**, hasta que se corrija la regla — denegación de servicio del flujo completo de Cotizaciones u Órdenes de Compra. Además, la excepción ocurre ANTES de llegar al `audit.log()`, así que el incidente no queda auditado.

**Cómo se reprodujo.**
```sql
INSERT INTO document_flow_rules (..., trigger_event, required_documents, ..., status)
VALUES (..., 'QUOTE_REQUESTED',
  '[{"key":"x","label":"x","source":"evil_fake_source","required":true}]'::jsonb, ..., 'active');
```
```bash
curl -X POST http://localhost:3004/quotes/email -H "Authorization: Bearer <token>" \
  -d '{"from":"contacto00002@corporacinde.com","subject":"Cotizacion","body":"Favor cotizar 2 BOPP Transparente"}'
# ANTES del fix → HTTP 500 "Internal server error"
```

**Evidencia.** Log real del servidor:
```
Error: DocumentSource "evil_fake_source" no registrado
    at DocumentSourceRegistry.resolve (.../document-source.registry.js:31:19)
    at DocumentFlowEngine.runRule (.../document-flow.engine.js:63:41)
```

**Código afectado.** `backend/src/modules/document-flow/document-source.registry.ts`, `backend/src/modules/document-flow/document-flow.engine.ts`.

**Corrección aplicada.** `resolve()` ahora devuelve `DocumentSource | undefined` (nunca lanza) — mismo patrón que las otras dos registries. El motor trata "no registrado" como un documento en estado `unavailable`, lo que hace que la regla quede `partial` (no ejecuta acciones) **y sí queda auditada**.

**Estado.** ✅ Corregido. Test de regresión con la `DocumentSourceRegistry` real (no un mock): `document-flow.engine.spec.ts` — "DocumentSource no registrado (regla maliciosa/corrupta) → falla controlado, NUNCA lanza". Re-verificado en vivo: la misma regla maliciosa ya no produce 500.

**Nota relacionada:** durante la reproducción se encontró que la API (`POST /document-flow/rules`) corrompe silenciosamente `requiredDocuments` en ciertos casos (un array de un objeto se guardó como `[[]]`) — la validación de ese campo es solo `@IsArray()` superficial, sin `@ValidateNested`. No es explotable hoy gracias al fix anterior (un array corrupto también cae en el mismo camino "no registrado" controlado), pero es una brecha de integridad de datos real. **No corregido en RC1** (requiere DTOs anidados nuevos — más una mejora de robustez de API que una vulnerabilidad de seguridad directa); queda como riesgo abierto documentado en el Sprint 8.

---

### [LOW-1] Secreto JWT de respaldo hardcodeado (código muerto hoy, riesgo si se refactoriza)

**Descripción.** Cuatro módulos (`tenants.module.ts`, `dataset.module.ts`, `integration-hub.module.ts`, `security.module.ts`) configuran su propio `JwtModule` con el fallback `'default-jwt-secret-change-in-production'` si `JWT_SECRET` no está seteada.

**Riesgo real hoy:** ninguno explotable — `JwtAuthGuard.canActivate()` (el único punto real de verificación) lee `process.env.JWT_SECRET` **directamente**, ignorando el `JwtService` inyectado de esos módulos; confirmado probando el secreto por defecto contra el token real (rechazado, HTTP 401). El fallback es efectivamente código muerto.

**Riesgo futuro:** si alguien refactoriza `JwtAuthGuard` para usar el `JwtService` inyectado en vez de `process.env` directo, y `JWT_SECRET` llegara a faltar en algún ambiente, cualquiera podría forjar tokens válidos con ese string público (está en el código fuente).

**Cómo se reprodujo.** Se probaron 8 secretos comunes (incluyendo el fallback literal) firmando tokens con `isSuperAdmin:true` — los 8 fueron rechazados (401), confirmando que `JWT_SECRET` real está configurado y que el guard no usa el fallback.

**Código afectado.** Los 4 archivos mencionados.

**Corrección aplicada.** Ninguna en RC1 (no reduce un riesgo de producción hoy, por regla explícita de alcance de RC1). **Recomendación registrada:** eliminar el fallback y fallar rápido (`throw`) si `JWT_SECRET` no está seteada al arrancar, en vez de tener un valor por defecto inseguro en el código.

**Estado.** 🟡 Documentado, no corregido (bajo impacto, fuera del criterio "reduce riesgo real" de RC1).

---

### [LOW-2] Tokens de acceso no revocables instantáneamente (por diseño)

**Descripción.** `JwtAuthGuard` valida únicamente firma + expiración del access token (15 min) — no consulta `tokenVersion` contra la base de datos en cada request (a diferencia del refresh token, que sí lo hace y rota en cada uso — verificado en `AuthService.refresh()`).

**Riesgo.** Un access token robado sigue siendo válido hasta por 15 minutos después de un logout o cambio de contraseña.

**Evidencia de que es una decisión consciente, no un descuido:** el propio código lo documenta explícitamente (`auth.service.ts`, comentario junto a la invalidación de refresh tokens) como una ventana aceptada a cambio de no pagar una consulta a BD en cada request autenticado.

**Corrección aplicada.** Ninguna — es un trade-off estándar de la industria (ventana corta + revocación real en el refresh) y agregar un chequeo de revocación por request (BD o blocklist en Redis) sería exactamente el tipo de infraestructura "por si acaso" que la directriz de alcance de RC1 pide evitar, dado que ya existe una mitigación razonable (15 min).

**Estado.** 🟢 Aceptado por diseño, sin acción.

---

### [LOW-3/INFORMATIVO] Sin superficie de carga de archivos

**Descripción.** Se buscó exhaustivamente (`FileInterceptor`, `multer`, `@UploadedFile`) en todo `backend/src` — **no existe ningún endpoint de carga de archivos binarios** en el sistema actual. Los "adjuntos" de PO/clasificación son solo metadatos (`{filename, mimeType}` en JSON), nunca contenido binario real.

**Implicación para la sección "Uploads" de este Sprint 5:** ejecutables, ZIPs, PDFs enormes, MIME falsos, extensiones dobles, archivos corruptos — **ninguno de estos vectores aplica hoy**, porque no hay dónde subir un archivo real. Esto deja de ser cierto el día que se implemente una carga real de archivos (ej. Fase COMEX, adjuntar la Lista de Empaque real) — en ese momento este apartado debe re-auditarse desde cero.

**Estado.** ⚪ No aplica hoy — verificado por búsqueda exhaustiva, no asumido.

---

### [INFORMATIVO] Riesgo de proceso: claves de firma de licencia efímeras fuera de Docker

**Descripción.** El contenedor `dta-backend` tiene `LICENSE_SIGNING_PRIVATE_KEY`/`PUBLIC_KEY` configuradas de forma persistente en `docker/.env` (correcto). Pero cualquier proceso Node ejecutado FUERA de docker (ej. un test local, un script) sin esas mismas variables de entorno genera un par de claves Ed25519 efímero propio — y si ese proceso llama a `licensing.renew()` contra la misma base de datos compartida, **sobrescribe la firma de la licencia con una clave que nadie más tiene**, invalidándola para el contenedor real.

**Cómo se descubrió.** Ocurrió literalmente durante esta revisión: una renovación de licencia ejecutada en un proceso de test local (sin las variables de entorno del contenedor) dejó al contenedor real respondiendo `403 license_tampered` en cada request. Se korrigió re-firmando la licencia desde un proceso que sí cargó las mismas variables que `docker/.env`.

**Nota positiva:** esto es evidencia real de que la verificación de firma Ed25519 **funciona correctamente** — detectó y rechazó una firma que no correspondía a la clave configurada, exactamente el comportamiento esperado ante manipulación de la licencia (ver requisito "modificar licencia" del alcance de este sprint).

**Corrección aplicada.** Ninguna de código — es un riesgo operativo/de proceso, no una vulnerabilidad de la aplicación. **Recomendación registrada:** cualquier script/test que interactúe con `LicensingService` contra una base de datos compartida debe exportar las mismas `LICENSE_SIGNING_*` que el ambiente objetivo.

**Estado.** 🟡 Riesgo de proceso documentado, no una vulnerabilidad de código.

---

## Rate Limiting y fuerza bruta (evaluación solicitada explícitamente)

**Alcance de esta evaluación:** protección a nivel de aplicación (dentro del proceso Node/NestJS). No cubre protección a nivel de red/perimetral — ver Apéndice "Aspectos no evaluados en RC1".

**Hallazgo: ya existe protección de dos capas, ambas verificadas en vivo con ataques reales.**

### Capa 1 — Throttling global + específico de auth (`@nestjs/throttler`)

`app.module.ts` configura 3 buckets globales por IP (aplican a **todo** endpoint que no tenga override):

| Bucket | Ventana | Límite |
|---|---|---|
| `short` | 1 seg | 20 requests |
| `medium` | 1 min | 300 requests |
| `long` | 1 hora | 10.000 requests |

`auth.controller.ts` además sobreescribe con un límite más estricto específico para `/auth/login` y `/auth/platform-login`: **10 requests/minuto por IP**, independiente del bucket global.

**Prueba 1 — Fuerza bruta contra `/auth/login` (15 intentos rápidos, credenciales inválidas):**
```
intento 1  -> HTTP 401
...
intento 10 -> HTTP 401
intento 11 -> HTTP 429   ← corta exactamente en el límite configurado (10/min)
...
intento 15 -> HTTP 429
```

**Prueba 2 — Ráfaga de 30 requests simultáneos contra `/quotes/email`** (endpoint autenticado, sin override propio — hereda el bucket global `short` de 20/seg):
Resultado: mezcla de `201` (éxito), `409` (conflicto de idempotencia por contenido idéntico) y **`429`** — confirma que el endpoint SÍ hereda el límite global sin necesitar configuración adicional.

**Prueba 3 — Abuso volumétrico contra `/health`** (endpoint público, sin autenticación — el más expuesto a scraping/DoS de aplicación): 500 requests disparados en ~15 segundos → **200 exitosos, 300 cortados con HTTP 429**. Confirma que incluso un endpoint sin autenticación no puede ser martillado sin límite.

### Capa 2 — Bloqueo de cuenta por intentos fallidos (independiente del throttling)

`auth.service.ts` implementa un bloqueo por credenciales específicas, más allá del límite por IP: `MAX_FAILED_ATTEMPTS = 5`, `LOCKOUT_MS = 15 minutos`. Esto protege contra un atacante que rota de IP (evadiendo el throttling) pero sigue apuntando a la misma cuenta.

**Prueba controlada (cuenta `admin@oben.com`, reseteada antes de la prueba):**
```
intento 1 -> {"statusCode":401,"message":"Credenciales inválidas"}
intento 2 -> {"statusCode":401,"message":"Credenciales inválidas"}
intento 3 -> {"statusCode":401,"message":"Credenciales inválidas"}
intento 4 -> {"statusCode":401,"message":"Credenciales inválidas"}
intento 5 -> {"statusCode":401,"message":"Credenciales inválidas"}
intento 6 -> {"statusCode":401,"message":"Cuenta bloqueada temporalmente por
              múltiples intentos fallidos. Intenta de nuevo en 15 minuto(s)."}
```
Bloqueo confirmado disparando exactamente en el intento 6 (tras 5 fallos), con mensaje explícito y persistido en BD (`locked_until` avanzado 15 minutos). La cuenta de prueba fue liberada (`failed_login_attempts=0, locked_until=NULL`) inmediatamente después de la verificación para no afectar el uso real del piloto.

**Conclusión:** para los endpoints que probablemente serán públicos (`/auth/login`, `/quotes/email`, `/purchase-orders/email`), la protección de aplicación es real, verificada con ataques efectivos, y por diseño (bucket específico más estricto en auth + bloqueo de cuenta independiente del throttling). **Es aceptable para el estado actual del piloto.** No se requiere una capa adicional (ej. CAPTCHA) para RC1 bajo la regla de alcance ya acordada — no reduce un riesgo de producción no cubierto hoy.

---

## Revisión de logs — búsqueda de fuga de credenciales/PII

**Método:** (a) grep estático de todas las llamadas a logger/console en el código en busca de interpolación de campos sensibles; (b) inspección en vivo de `docker logs dta-backend` (incluyendo tráfico real generado durante toda esta revisión: intentos de login con contraseñas, tokens `Authorization: Bearer`, correos de prueba) buscando `password`, `jwt`, `token`, `authorization`, `bearer`, y los valores literales usados en las pruebas.

| Dato buscado | Resultado |
|---|---|
| Contraseñas en texto plano | No se encontró ninguna ocurrencia (el hash ocurre antes del primer punto de logging) |
| **Hash de contraseña (bcrypt)** | **Encontrado en logs de query SQL — ver [HIGH-3](#high-3-nodeenvdevelopment-en-el-ambiente-real-del-piloto--hash-de-contraseñas-en-logs--riesgo-de-pérdida-de-datos-por-synchronize), corregido** |
| JWT / Authorization header / Bearer | Ninguna ocurrencia en `docker logs`, pese a decenas de requests con `Authorization: Bearer <token>` real durante toda la sesión de pruebas. No existe middleware/interceptor que loguee headers de request. |
| Cookies | No aplica — el sistema es 100% Bearer-token vía header `Authorization`; no se usa `res.cookie()`, `Set-Cookie` ni `cookie-parser` en ningún punto del código (`grep` exhaustivo sin resultados) |
| Tokens OAuth / API Keys de terceros | No se encontraron API keys ni tokens hardcodeados en `src` fuera de variables de entorno (`grep` de patrones tipo `api_key = "..."` sin resultados) |
| Números de tarjeta | No aplica — el sistema no procesa ni almacena datos de pago; no existe ningún campo, entidad ni integración relacionada con tarjetas |
| PII (nombre/email de cliente) en logs de aplicación | Los `logger.debug()` del `DocumentFlowEngine`, adapters y auditoría loguean únicamente metadatos operacionales (tenant id, tipo de documento/acción, estado, duración en ms) — **no** interpolan el contenido de negocio (nombre de cliente, email, producto). Confirmado leyendo las 4 llamadas a logger de `document-flow.engine.ts`, `base-adapter.ts`, `security-bootstrap.service.ts` y `license-signing.service.ts` (esta última solo loguea el `keyId`, nunca la clave privada) |

**Hallazgo derivado de esta revisión:** ver [HIGH-3](#high-3-nodeenvdevelopment-en-el-ambiente-real-del-piloto--hash-de-contraseñas-en-logs--riesgo-de-pérdida-de-datos-por-synchronize) — corregido. Sin ese problema de configuración, el código de la aplicación en sí mismo es disciplinado respecto a qué loguea.

---

## Vectores evaluados sin hallazgos (evidencia de qué se intentó)

| Vector | Qué se intentó | Resultado |
|---|---|---|
| **JWT — `alg:none`** | Token con header `{"alg":"none"}` y payload con `isSuperAdmin:true` | 401 rechazado |
| **JWT — secreto adivinado** | 8 secretos comunes (`secret`, `changeme`, el fallback hardcodeado del código, `123456`, `oben`, `password`, etc.) firmando `isSuperAdmin:true` | 401 en los 8 casos |
| **JWT — expiración** | Token válido con `exp` en el pasado | 401 rechazado |
| **JWT — token vacío/basura/Basic auth** | Headers malformados | 401 en todos los casos |
| **Refresh token — replay/revocación** | Revisión de `AuthService.refresh()`: valida `tokenVersion` contra BD y lo incrementa en cada uso (rotación real) | Correcto — un refresh token usado o revocado no es reutilizable |
| **Tenant isolation — IDOR** | Cliente + cotización reales creados en un tenant distinto (`attacker-corp`); acceso directo por ID y por listado con token de `oben` | 404 en ambos casos — no se filtró información de existencia |
| **Tenant isolation — header `x-tenant-id`** | Mismo intento anterior + header de impersonación (usuario NO superadmin) | Ignorado correctamente, sigue devolviendo 404 |
| **Autorización — endpoint de plataforma** | `GET /platform/tenants` con token de tenant normal | 403 `missing_platform_role` |
| **SQL Injection** | Payloads clásicos (`'; DROP TABLE quotes; --`, `' OR 1=1; --`) en `from`/`subject`/`body` de `POST /quotes/email` | Tratados como texto literal (TypeORM parametrizado); tabla `quotes` intacta (verificado con `SELECT count(*)`) |
| **Command Injection** | Búsqueda exhaustiva de `child_process`/`exec`/`spawn` en todo `backend/src` | Cero usos reales (los 2 matches eran `RegExp.exec()`, no `child_process`) |
| **XXE** | Búsqueda de parsers XML (`xml2js`, `fast-xml-parser`, etc.) en dependencias y código | Ninguno — el sistema no parsea XML en ningún punto |
| **Path Traversal** | Búsqueda de `fs.readFile`/`writeFile`/streams con input de usuario | Única operación de filesystem real es sobre un directorio fijo de migraciones SQL, no input de usuario |
| **DocumentFlowEngine — evento inexistente** | `POST /document-flow/rules` con `triggerEvent` fuera de `BUSINESS_EVENTS` | 400 rechazado por `@IsIn` |
| **DocumentFlowEngine — acción/validador inexistente** | Regla con `actions:[{"type":"evil_fake_action"}]` y `validations:[{"type":"evil_fake_validator"}]` | Falla controlada preexistente (`ActionExecutorRegistry`/`ValidatorRegistry` ya devolvían `undefined`, no lanzaban) |
| **Licenciamiento — modificar licencia/firma** | Ver hallazgo informativo arriba — ocurrió una manipulación real de facto | Rechazada como `license_tampered` |
| **Licenciamiento — fingerprint** | Revisión de código: `installationFingerprint` viaja dentro de los claims firmados (`licensing.service.ts`) | Copiar la fila de licencia a otra instalación produciría un fingerprint distinto → firma inválida para esos claims |

---

## Apéndice — Aspectos no evaluados en RC1

Este Sprint 5 auditó la **aplicación** (Oben Plus: backend NestJS, frontend, base de datos, y su configuración de despliegue inmediata en `docker/.env` y `docker-compose.yml`). Los siguientes aspectos de infraestructura **no fueron evaluados** en esta revisión y **no deben interpretarse como cubiertos** por este informe, hoy ni en una lectura futura de este documento:

- **Rate limiting a nivel de red/perimetral** — balanceador de carga, CDN o edge. Lo evaluado en este Sprint 5 fue exclusivamente el rate limiting **de aplicación** (dentro del proceso Node), verificado con ataques reales — ver sección "Rate Limiting y fuerza bruta" arriba. No se evaluó limitación de tasa distribuida entre múltiples réplicas ni a nivel de infraestructura de red.
- **DoS distribuido (DDoS volumétrico)** — ataques desde múltiples IPs/orígenes simultáneos. No se simuló ni se evaluó ninguna mitigación a ese nivel (típicamente responsabilidad del proveedor de hosting/CDN, no de la aplicación).
- **WAF (Web Application Firewall)** — no existe ni se evaluó ninguna capa de WAF delante de la aplicación.
- **Seguridad del proxy inverso** — configuración de Nginx/Traefik/similar (si se usa en el despliegue final), headers de proxy, terminación TLS a ese nivel.
- **TLS** — cifrado en tránsito, configuración de certificados, versiones de protocolo soportadas. El entorno de pruebas de esta revisión operó sobre HTTP plano (`localhost`).
- **Seguridad del sistema operativo** — hardening del host (Windows/Linux) donde corren los contenedores, parches del kernel, superficie de ataque del SO.
- **Docker hardening** — políticas de usuario no-root dentro de los contenedores, `seccomp`/`AppArmor`, límites de recursos, superficie de la imagen base, escaneo de vulnerabilidades de dependencias del SO en la imagen.
- **Kubernetes** — no aplica al despliegue actual (docker-compose); si se migra a K8s en el futuro, requiere su propia revisión (RBAC de cluster, network policies, secrets management de K8s, etc.).
- **Secret Management** — los secretos actuales viven en un archivo `docker/.env` plano. No se evaluó (ni se implementó) una solución dedicada de gestión de secretos (Vault, AWS Secrets Manager, etc.); ver también la nota sobre `JWT_SECRET`/`DB_PASSWORD` con apariencia de valores de prueba, documentada en HIGH-3.
- **Backups cifrados** — no se evaluó la existencia, frecuencia, cifrado o proceso de restauración de backups de la base de datos.

Ninguno de estos puntos se corrigió ni se descartó como "no importante" — simplemente **quedaron fuera del alcance de este sprint**, que se centró en la aplicación. Deben tratarse como pendientes explícitos antes de considerar la plataforma auditada de forma integral a nivel de infraestructura.

---

## Resultado de la suite completa (post-fixes)

**33/33 suites, 224/224 tests.** Incluye los 4 tests nuevos de la revisión original (XSS: 3, SSRF: 10, DocumentFlowEngine: 1 — 14 en total, algunos agrupados). El addendum del 2026-07-31 (Rate Limiting, revisión de logs, fix de `NODE_ENV`) se verificó en vivo contra el contenedor real y no requirió tests nuevos de regresión — el cambio fue de configuración de ambiente (`docker/.env`), no de código.

Contenedor `dta-backend` reconstruido y redesplegado con todos los fixes (incluido `NODE_ENV=production`); `/health` OK; feature flags del tenant `oben` siguen en `{}` (apagadas, sin tocar); integridad de datos de `tenants`/`users`/`quotes` verificada antes y después del redeploy.

Toda la data de prueba (tenant `attacker-corp`, reglas maliciosas, cotizaciones/órdenes de esta sesión, dead letters de prueba, usuario `logtest_*@test.com` del addendum) fue eliminada de la base de datos al cierre de esta revisión. La cuenta `admin@oben.com`, usada para las pruebas de bloqueo por fuerza bruta, fue explícitamente desbloqueada (`failed_login_attempts=0, locked_until=NULL`) al finalizar.
