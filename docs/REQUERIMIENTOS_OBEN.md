# Requerimientos a Oben — para activar Integraciones

> Estado: NO se inicia ninguna integración real hasta recibir esta información oficial.
> El código del Integration Hub está construido y desplegado; solo falta el acceso.

## 1. Credenciales y endpoints faltantes

### VETA (proveedores / compras — 6 APIs de lectura)
| Necesario | Variable | Detalle |
|---|---|---|
| Base URL | `VETA_BASE_URL` | host raíz de las APIs (ej. `https://veta.obengroup.co/api`) |
| Credencial | `VETA_API_KEY` | key de lectura |
| Header de la key | `VETA_API_KEY_HEADER` | nombre del header (default `x-api-key`) |
| Contrato de query params | — | formato exacto de `date` y `po` por endpoint |
| Esquema de response | — | estructura JSON real para ajustar los mappers |

APIs: `APIVendorImportDate`, `APIItemsImportDate`, `APIPurchOrdImportDate`,
`APIPurchOrdImportSel`, `APIItemRcptDate`, `APIItemRcptPurchOrder`.

### NetSuite (SuiteQL — lectura)
| Necesario | Variable | Detalle |
|---|---|---|
| Account ID | `NETSUITE_ACCOUNT_ID` | deriva el host SuiteTalk |
| Consumer Key | `NETSUITE_CONSUMER_KEY` | app de integración (TBA) |
| Consumer Secret | `NETSUITE_CONSUMER_SECRET` | — |
| Token ID | `NETSUITE_TOKEN_ID` | token del usuario de integración |
| Token Secret | `NETSUITE_TOKEN_SECRET` | — |
| Rol/permisos | — | rol con permiso de SuiteQL/consulta de las tablas requeridas |

### Armstrong (producción / logística)
| Necesario | Variable | Detalle |
|---|---|---|
| Base URL | `ARMSTRONG_BASE_URL` | — |
| Token | `ARMSTRONG_TOKEN` | bearer |
| **Documentación de endpoints** | — | **falta el contrato completo de la API** (lectura) |

## 2. Payloads faltantes
- Ejemplos reales de request/response de cada API (para validar mappers y DTOs).
- Para escritura futura: payloads de creación (no se implementará hasta aprobación).

## 3. Documentación faltante
- Especificación de Armstrong (endpoints, auth, formatos).
- Confirmación de ambientes: ¿hay sandbox/QA o solo producción? (define dónde probar).
- Política de rate limiting / ventanas horarias de cada sistema.

## 4. Confirmación de ambientes
- URL de sandbox de NetSuite/VETA si existen (para pruebas controladas).
- Si solo hay producción: definir ventana y alcance de pruebas de lectura.

## Procedimiento de activación (una vez recibido lo anterior)
1. Cargar variables en `~/dta/docker/.env`.
2. `docker compose ... up -d backend`.
3. `curl /integrations/status` → `configured:true`.
4. Probar una llamada de lectura por sistema; ajustar mappers contra el response real.
5. Reclasificar en `MATRIZ-INTEGRACIONES.md`: `pendiente_credenciales → operativa`.

**Escritura en producción:** NO se habilita hasta payloads validados + pruebas
controladas + aprobación explícita + rollback documentado.
