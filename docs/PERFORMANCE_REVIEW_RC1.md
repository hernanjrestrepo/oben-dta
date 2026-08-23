# Performance Review — RC1 (WO-018 Sprint 6)

**Fecha:** 2026-07-31 · **Rama:** `sprint2-customer-core` · **Metodología:** pruebas reales contra el contenedor `dta-backend` en ejecución (no estimaciones ni benchmarks sintéticos aislados).

## Objetivos del piloto (definidos por el usuario, base de esta revisión)

El piloto de Oben será operado inicialmente por 1 persona (CEO de Paradixe) junto con el equipo de TI de Oben. **El énfasis es confiabilidad, trazabilidad y resiliencia, no throughput masivo.**

| # | Objetivo | Resultado |
|---|---|---|
| 1 | 1 a 5 usuarios concurrentes | ✅ Cumple |
| 2 | Procesamiento secuencial de correos reales | ✅ Cumple |
| 3 | Hasta 100 correos/día | ✅ Cumple, con amplio margen |
| 4 | Latencia <2s clasificación / <10s generación de cotización | ✅ Cumple, con amplio margen |
| 5 | Estabilidad 24/7 | ⚪ Pendiente de verificar en el host Linux real — ver hallazgo #1 |
| 6 | Cero pérdida de correos | 🟡 Conector construido y probado con mocks; falta activar con credenciales reales confirmadas — ver hallazgo #2 |
| 7 | Idempotencia garantizada | ✅ Cumple (ya certificado en Sprint 4) |
| 8 | Recuperación automática ante fallos | ⚪ Observado como falla en Docker Desktop/Windows; **no confirmado** como defecto del producto — pendiente de re-prueba en Linux, ver hallazgo #1 |

**Resumen:** el motor de procesamiento en sí (clasificación → extracción → generación de cotización → PDF → envío) es rápido, confiable e idempotente, con márgenes muy amplios respecto a los objetivos del piloto. Los dos puntos que requieren atención antes de certificar el Go-Live **no son de rendimiento del código** — son de **infraestructura de despliegue** (política de reinicio del contenedor) y de **alcance de integración** (el conector de intake IMAP real aún no existe en el código).

---

## Objetivos 1-4: Latencia y volumen — evidencia real

### Prueba: 20 solicitudes de cotización reales, secuenciales, con cliente y producto activos del tenant `oben`

Se usó un cliente real (`Corporación del Caribe & Cía. #00001`) y un producto real y activo (`BOPP Transparente`, `OBEN-BOPP-TR`), replicando exactamente el patrón esperado del piloto (secuencial, no ráfagas). Cada request ejecuta el pipeline completo: identificación de cliente → extracción de ítems del catálogo → generación de cotización → generación de PDF (base64) → envío de respuesta.

```
req 1  -> 328ms | outcome=quoted
req 2  -> 219ms | outcome=quoted
req 3  -> 578ms | outcome=quoted   (outlier, aun así muy por debajo del objetivo)
req 4  -> 278ms | outcome=quoted
req 5  -> 204ms | outcome=quoted
req 6  -> 211ms | outcome=quoted
req 7  -> 197ms | outcome=quoted
req 8  -> 311ms | outcome=quoted
req 9  -> 285ms | outcome=quoted
req 10 -> 209ms | outcome=quoted
req 11 -> 201ms | outcome=quoted
req 12 -> 243ms | outcome=quoted
req 13 -> 232ms | outcome=quoted
req 14 -> 277ms | outcome=quoted
req 15 -> 247ms | outcome=quoted
req 16 -> 234ms | outcome=quoted
req 17 -> 228ms | outcome=quoted
req 18 -> 214ms | outcome=quoted
req 19 -> 229ms | outcome=quoted
req 20 -> 198ms | outcome=quoted
```

**Resultado:** min 197ms, max 578ms, la gran mayoría entre 200-330ms. **El pipeline completo (clasificación + generación de cotización + PDF) corre entre 3 y 10 veces más rápido que el objetivo más exigente** (<2s clasificación, <10s generación). Nota: la clasificación actual es 100% basada en reglas determinísticas (catálogo + regex), sin latencia de LLM — el motor híbrido con Ollama, si se activa a futuro para casos ambiguos, tendría su propio presupuesto de latencia a medir por separado.

**Volumen (100 correos/día):** a este ritmo, procesar 100 correos secuenciales tomaría del orden de 20-30 segundos de cómputo total repartidos a lo largo del día — sin ningún riesgo de saturación. Los buckets de rate limiting configurados en Sprint 5 (20/seg, 300/min, 10.000/hora) tienen margen de sobra frente a este volumen; no se necesita ningún ajuste.

**Nota metodológica:** la primera ronda de pruebas usó productos "seed" de demostración que resultaron estar marcados `isActive=false` en el catálogo — el extractor de ítems los excluye correctamente (comportamiento esperado, no es un bug), lo que inicialmente generó falsos "insufficient_info". Se corrigió usando productos activos reales del catálogo para medir el camino real de generación de cotización.

**Recursos:** tras las ~40 requests de esta sesión de pruebas, el contenedor mantuvo 1 sola conexión activa a Postgres (sin fugas de conexión) y ~99 MiB de memoria — footprint muy liviano para la escala del piloto.

---

## Objetivo 7: Idempotencia

Ya certificada con evidencia real en RC1 Sprint 4 (`idempotency.e2e-spec.ts`): duplicados por `messageId`/hash de contenido bloqueados correctamente, incluyendo una prueba de 15 requests concurrentes idénticos donde solo 1 se procesó. No se repite aquí — se referencia como ya cumplido.

---

## Hallazgo #1 [NO CONFIRMADO — pendiente de re-prueba en el host Linux real del piloto]: la política `restart: unless-stopped` no reinició el contenedor tras un crash real

> **Corrección tras revisión del usuario (2026-08-01):** esta prueba se ejecutó en Docker Desktop para Windows, el entorno de desarrollo local — **no** en el host Linux donde se desplegará el piloto de Oben. El comportamiento de `restart: unless-stopped` ante `docker kill` es conocido por ser inconsistente en Docker Desktop/WSL2 en ciertas configuraciones, y puede no reproducirse en absoluto en Docker Engine sobre Linux, donde esta política suele funcionar de forma confiable. **Este hallazgo NO debe interpretarse como un defecto del producto** hasta repetir exactamente la misma prueba en el servidor Linux real de destino. Se mantiene documentado abajo únicamente como evidencia de lo que se observó y como recordatorio de la verificación pendiente — no como un problema certificado.

**Descripción.** `docker-compose.yml` declara `restart: unless-stopped` en los 3 servicios core (`postgres`, `redis`, `backend`), y `docker inspect` confirma que el contenedor corriendo tiene esa política activa. Se simuló un crash real (no un `docker exec kill` interno, que resultó no ser representativo — se usó `docker kill dta-backend`, que envía `SIGKILL` al proceso raíz del contenedor desde el daemon, exactamente como ocurriría ante un crash real del proceso).

**Resultado:** el contenedor **NO se reinició automáticamente**. Quedó en estado `Exited (137)` indefinidamente — se esperó 39 segundos en la primera prueba y se repitió una segunda vez con `docker events` capturando en paralelo para confirmar que no fue un evento aislado.

**Evidencia (repetida 2 veces, reproducible).** `docker events` mostró el ciclo completo `container kill` → `container die (exitCode=137)`, sin ningún evento posterior de `start`/`restart`:
```
... container kill ... (signal=9)
... container die ... (exitCode=137)
[sin más eventos — el contenedor permanece detenido]
```
```bash
docker inspect dta-backend --format "RestartPolicy: {{.HostConfig.RestartPolicy.Name}}"
# → RestartPolicy: unless-stopped   (correctamente declarada, pero no efectiva en este host)
```

**Impacto.** Si el proceso del backend muere por cualquier motivo en producción (OOM, excepción fatal no capturada, etc.), **el servicio queda caído hasta que alguien lo reinicie manualmente**. Esto contradice directamente el objetivo "estabilidad 24/7" y "recuperación automática ante fallos" — son, junto con la idempotencia, los requisitos que el usuario marcó como el énfasis real de este sprint (por encima de throughput).

**Causa probable (no confirmada con certeza — ver recomendación).** Esta prueba se ejecutó en el entorno de desarrollo de Windows con Docker Desktop del autor de este informe, **no necesariamente el host donde se desplegará el piloto real**. Hay reportes conocidos de comportamiento inconsistente de `restart: unless-stopped` en Docker Desktop para Windows/WSL2 en ciertas configuraciones. No se puede descartar sin más información que sea un problema específico de este host de desarrollo y no del host de producción real.

**Corrección aplicada.** Ninguna todavía — **este hallazgo requiere una decisión de infraestructura, no un cambio de código**: confirmar en qué host se desplegará realmente el piloto (¿este mismo Windows+Docker Desktop, o un servidor Linux dedicado?) y repetir esta misma prueba (`docker kill` + observar si reinicia) en ese host específico antes de dar por cumplido el objetivo 8. Si el problema persiste en el host real, la mitigación más simple es un watchdog externo (ej. un servicio de systemd, o un healthcheck de infraestructura que reinicie el contenedor si `docker ps` lo reporta caído) — deliberadamente NO se implementa un mecanismo adicional en el código de la aplicación todavía, para no adivinar una solución a un problema cuya causa raíz depende del host de destino.

**Estado.** ⚪ No confirmado como defecto del producto — pendiente de re-prueba en Docker Engine sobre Linux (el host real del piloto). No bloquea RC1 por sí mismo; bloquea únicamente la certificación final de "recuperación automática" y "24/7" hasta que se repita la prueba en el entorno correcto.

---

## Hallazgo #2 [MEDIO → EN PROGRESO]: el conector de intake IMAP real

> **Actualización 2026-08-03:** tras este hallazgo, el usuario lo marcó como máxima prioridad y se construyó el conector completo (`backend/src/modules/email-intake/`). Ver detalle abajo — sigue sin poder darse por **certificado end-to-end** porque no se ha conectado todavía contra el buzón real de Oben.

**Descripción original.** Se buscó en todo el repositorio (`backend/src` completo, sin resultados) cualquier mecanismo de sondeo/lectura de un buzón IMAP real. No existía. Los endpoints `/quotes/email` y `/purchase-orders/email` eran receptores que esperaban el correo ya parseado, sin nada que lo alimentara desde un buzón real.

**Lo que se construyó (2026-08-03):**
- `ImapConnectorService` (`backend/src/modules/email-intake/imap-connector.service.ts`): conector IMAP real vía `imapflow`, con IDLE (o polling configurable), reconexión con backoff exponencial, reconciliación de no-leídos en cada (re)conexión, checkpoint de idempotencia en tabla propia (`email_intake_messages`, migración `0006_email_intake.sql`), clasificación automática reutilizando el `ClassifierRegistry` ya existente (cotización / orden de compra / naviera / COMEX / desconocido), enrutamiento al mismo `QuotesService`/`PurchaseOrdersService` que usa el endpoint HTTP (vía `ModuleRef` + `ContextIdFactory` para resolver los servicios request-scoped fuera de una request HTTP), marca `\Seen` + mueve a carpeta "Procesados" configurable, y audita cada correo sin flujo automático (naviera/COMEX) en vez de descartarlo.
- `EmailSmtpRealAdapter` (`backend/src/modules/integrations/hub/adapters/email-smtp.real.ts`): adaptador de salida SMTP real vía `nodemailer`, mismo contrato `IntegrationAdapter` que el resto del Integration Hub, resuelto automáticamente desde `AdapterRegistry` cuando `tenant.integrationConfig.email.mode === 'real'`.
- 15 tests unitarios nuevos (enrutamiento por categoría, dedupe por Message-ID, correo ya procesado no se reprocesa, fallo del flujo destino no bloquea la marca `\Seen`, y — importante — que el conector **no se autoconecta** salvo que el tenant tenga `integrationConfig.email.mode=real` **y** `imap.enabled=true` explícitos). Suite completa: 35/35 suites, 239/239 tests, verificado en vivo contra el contenedor reconstruido (`dta-backend: healthy`, tabla `email_intake_messages` creada correctamente).

**Lo que falta para certificar end-to-end (no se hizo hoy, deliberadamente):**
1. **No se conectó contra el buzón real** `pedidosdeventa.co@obengroup.com` — el mensaje del usuario con los datos IMAP llegó incompleto (`IMAP Entrante : 9993`, sin confirmar si es un proxy interno de Oben o un typo de `993`; `SMTPoffice365.com` sin host separado del puerto). Conectar con datos adivinados contra un buzón de producción real arriesga marcar correos reales como leídos/moverlos sin necesidad — se dejó explícitamente sin probar en vivo hasta tener el host/puerto IMAP confirmado.
2. Con eso confirmado, activar es solo configuración (no requiere tocar código):
```json
// tenant.integration_config.email
{
  "mode": "real",
  "smtp": { "host": "smtp.office365.com", "port": 587, "secure": false,
            "user": "pedidosdeventa.co@obengroup.com", "pass": "***", "fromAddress": "pedidosdeventa.co@obengroup.com" },
  "imap": { "enabled": true, "host": "outlook.office365.com", "port": 993, "secure": true,
            "user": "pedidosdeventa.co@obengroup.com", "pass": "***",
            "folder": "INBOX", "processedFolder": "Procesados" }
}
```
3. Tras activar, verificar en vivo: un correo real llega → se clasifica → se enruta → se marca leído → se mueve a "Procesados" — el primer correo real de prueba debe observarse con `docker logs -f dta-backend`.

**Estado.** 🟡 Construido y probado con mocks; **no conectado ni verificado contra el buzón real todavía** — pendiente únicamente de credenciales/host confirmados, no de desarrollo adicional.

---

## Conclusión del Sprint 6

El **motor de procesamiento** (lo que sí es núcleo de la plataforma) cumple los objetivos de latencia y volumen con márgenes muy amplios, y ya tenía idempotencia certificada desde Sprint 4. El conector de correo real (Hallazgo #2) ya está construido y probado con mocks; solo falta activarlo con credenciales confirmadas. Queda un único punto abierto que no depende de código:

1. **Repetir la prueba de `docker kill` en el host Linux real del piloto** (no en Docker Desktop/Windows, donde se observó el comportamiento inconsistente) — solo si se reproduce ahí pasa a ser un hallazgo real del producto. 15-30 minutos de prueba una vez que ese host esté disponible.

Ningún hallazgo de este sprint requiere reabrir el núcleo funcional, el DocumentFlowEngine, ni la capa de seguridad ya cerrada en Sprint 5.
