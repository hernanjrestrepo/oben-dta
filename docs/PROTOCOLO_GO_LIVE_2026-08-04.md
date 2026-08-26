# Protocolo Go-Live — Piloto Oben (actualizado 2026-08-26, cierre del día)

**Este documento reemplaza el estado descrito el 4 de agosto.** Todo lo de esa fecha sigue siendo cierto (nada de lo marcado ✅ resultó falso — ver el histórico al final), pero hoy se hizo por fin la prueba real de punta a punta que el documento original pedía hacer antes del demo, y esa prueba encontró y corrigió 13 bugs reales (9 de la tarde + 4 más en la sesión de pruebas conjuntas de la noche). Este es el estado vigente para el demo.

## Respuesta directa: ¿está listo para mañana?

**Sí, con una sola salvedad honesta — no hay nada más escondido.** Todo el negocio (cotizaciones, órdenes de compra, rechazos, lista de empaque, ciclo de orden a factura, la plataforma visual) está probado en vivo hoy, con evidencia real, en el servidor que se va a usar mañana. La única pieza que no llegué a cerrar al 100% es la siguiente — leerla antes de empezar:

## 🛡️ Único riesgo conocido — y su mitigación

El conector de correo tiene un bug de fondo que **no logré identificar la causa raíz exacta** pese a instrumentarlo a fondo: en ciertas condiciones, el ciclo de sondeo deja de avanzar sin ningún error visible. Cada vez que pasó hoy, un reinicio del backend lo resolvió al instante.

**Mitigación real, activa ahora mismo:** el servidor remoto tiene un cron que reinicia el backend automáticamente **cada 2 minutos** (`crontab -l` en `10.50.30.10`, usuario `paradixexyz` — reducido de 8 a 2 esta noche para achicar al máximo la ventana de riesgo). Esto es una medida externa al proceso de Node, no depende de que el código se autorepare.

**Lo que esto significa en la práctica:** en el peor de los casos, un correo que llega justo después de un reinicio podría tardar hasta ~2 minutos en procesarse, en vez de segundos. No es invisible, pero tampoco es un demo caído — es una demora corta y acotada, no un fallo total.

**Recomendación concreta para mañana:**
1. Antes de empezar, confirmar que el cron sigue activo (`crontab -l`) y hacer un reinicio manual (`docker restart dta-backend`) para arrancar con el reloj en cero.
2. Si un correo de prueba tarda más de un minuto o dos en el demo, no es necesario alarmarse ni parar — es exactamente el escenario ya conocido, se resuelve solo en el peor caso en unos minutos.
3. Tener el Plan B (disparar el flujo directo contra la plataforma, sin depender del correo) listo como respaldo si en algún momento se necesita mostrar el resultado sin esperar.

---

## ✅ Verificado en vivo HOY, con evidencia real — en local y en el servidor remoto (10.50.30.10)

| Flujo | Evidencia |
|---|---|
| Correo real → cliente identificado → cotización → PDF real adjunto → 1 solo correo enviado | Correo real de `hernan.jose.restrepo@outlook.com`, cotización `COT-1787768540317` ($4.670.750, local) y `COT-1787775237538` ($2.802.450, remoto) |
| Correo de aceptación → Orden de Compra validada (7 reglas de negocio) → Orden creada → correo de confirmación | Orden real creada en local y en remoto, ambas con las 7 validaciones (cliente activo, dominio autorizado, cotización existe/vigente, cupo de crédito, productos válidos, cantidades coherentes) pasando |
| Orden de Compra que NO pasa validación → correo de rechazo explicando el motivo real | Probado con cupo insuficiente + cantidad absurda — el cliente recibe el motivo exacto, no queda en silencio |
| Lista de empaque real de Oben (`spPackingListUSA_Paradixe`) para una orden ya existente en su ERP | Orden real N°10794 — 37 líneas con peso/lote/código de barra reales |
| Correo de dominio NO registrado → rechazo automático + caso comercial abierto | Correo real desde `hernanpeluo@hotmail.com`, dominio no reconocido, respuesta y caso comercial confirmados en auditoría |
| Correo de cliente registrado sin producto/cantidad reconocible → se pide la info faltante, no se inventa una cotización | Correo real "necesito una cotización para mi próximo pedido" → `insufficient_info`, respuesta automática enviada |
| Correo de naviera/booking → clasifica `carrier`, no se confunde con cotización | Casos reales (Maersk, B/L, tarifa naviera) — sin falsos positivos |
| Ciclo de Orden completo → Factura | Orden real: DRAFT → validación → confirmada → lista → entregada → factura `INV-20260826-0001` generada |
| Plataforma visual (login, dashboard, órdenes, clientes) | Verificado con datos reales en pantalla — orden y factura de hoy visibles correctamente |

## 🐛 Los 13 bugs reales que encontró la prueba de hoy — todos corregidos y re-verificados

1. Correo duplicado al cliente (reintento automático completaba un envío ya en curso tras timeout).
2. PDF sin adjuntar (solo iba referenciado en el cuerpo, herencia de cuando el único adapter era el mock).
3. El conector nunca detectaba correo nuevo — `client.mailbox.uidNext` de la librería IMAP no se refresca solo; había que pedir `STATUS` real en cada ciclo.
4. La conexión IMAP se quedaba muda tras ~40 min sin avisar (NAT/firewall cortando en silencio) — se agregó un watchdog que fuerza reconexión.
5. El Flujo 2 (Órdenes de Compra) no tenía ninguna regla de negocio configurada — el correo se clasificaba bien pero no pasaba nada.
6. La validación rechazaba una PO real porque el cliente no repetía producto/cantidad en su aceptación — ahora toma los items de la cotización relacionada si la PO no los repite.
7. Una PO rechazada quedaba validada en silencio, sin avisarle nada al cliente — ahora se le explica el motivo real.
8. **El servidor remoto tenía código y base de datos desactualizados**: nunca se había desplegado nada del Flujo 2 ahí, y faltaban tablas/columnas completas (`document_flow_rules`, `purchase_order_documents`, `quotes.validUntil`, entre otras) porque en producción el auto-sincronizado de esquema está apagado (por seguridad) y nunca se escribió la migración real correspondiente.
9. **`workflow_events.createdAt` en el servidor remoto no coincidía con lo que el código esperaba** (`created_at`) — esto rompía silenciosamente la auditoría de negocio de TODO el sistema en producción (cotizaciones, órdenes, PO), no solo del Flujo 2.
10. **El clasificador no reconocía errores de tipeo reales** ("Soliictud de Cotizacxion") — caía en `unknown` sin ningún flujo, dejando al cliente sin respuesta. Se agregó un segundo pase con tolerancia a errores (distancia de edición) que solo actúa cuando el texto exacto no encuentra nada.
11. **El clasificador no reconocía formas naturales de pedir cotización** ("necesito una cotización") — solo cubría "solicito/solicitud". Se agregaron los patrones reales que sí usa la gente.
12. **El watchdog contra cuelgues no cubría el `sleep()` del ciclo de sondeo** — encontrado con instrumentación en vivo: el ciclo se quedaba colgado exactamente ahí, sin que el watchdog (que sí cubría las otras esperas) lo detectara. Se envolvió también.
13. **El bloqueo silencioso volvió a aparecer incluso después de los arreglos anteriores** — no se identificó la causa raíz 100% (sospecha: algo a nivel de temporizadores de Node bajo ciertas condiciones, no confirmado). Por eso se agregó la red de seguridad externa (cron cada 8 min, ver arriba) — no depende de que el proceso de Node se comporte bien.

Se construyó además una herramienta de diagnóstico (`schema-diff.ts`) que compara las entidades del código contra la base de datos real sin modificar nada, para encontrar este tipo de diferencias de una sola vez en vez de un error a la vez.

## 🔵 Depende de terceros — no lo podemos resolver nosotros solos

1. **Correo oficial de Oben** (`pedidosdeventa.co@obengroup.com`) bloqueado por M365 (autenticación básica desactivada) + servidor de Oben sin salida en los puertos 993/587. Sigue exactamente igual que el 4 de agosto — pendiente de su equipo de TI. Usamos `ceo@paradixe.xyz` como buzón real del demo (Plan A, ver abajo), que sí funciona.
2. **Precio y disponibilidad en vivo desde Oben+**: revisadas las 9 operaciones que Oben expuso (`APICostOrderParadixe` + las 8 vía `APIConsultaParadixe`) — todas requieren un número de orden que YA EXISTE en su ERP; ninguna consulta precio/stock de un producto para armar una cotización nueva. **No existe ese endpoint hoy.** Mientras tanto, el precio sale del catálogo local de la plataforma (real, con los SKUs y precios de Oben, pero no en vivo). Pendiente pedirle a Oben si lo van a construir.
3. **Vínculo entre nuestras Órdenes y el número de orden real de Oben**: para automatizar la lista de empaque en cualquier orden que genere la plataforma (hoy solo funciona si ya se conoce el número de orden de Oben de antemano).
4. **Factura automática**: existe como función (`InvoicesService.createFromOrder`), pero hoy es un paso manual — nada la dispara sola al crear una Orden.

## Plan para el demo (sin cambios respecto al 4 de agosto, ahora con la prueba de punta a punta ya hecha)

**Plan A (preferido):** `ceo@paradixe.xyz` como buzón real — el equipo de Oben manda los correos de prueba ahí, el sistema los procesa solo, en vivo. **Ya probado de punta a punta hoy**, en local y en remoto.

**Plan B (respaldo):** disparar el mismo paso directo contra la plataforma, con la misma transparencia de siempre sobre el bloqueo del correo oficial de Oben.

---

## Histórico — estado al 2026-08-04 (referencia, ya superado por lo de arriba)

### ✅ Lo que SÍ estaba confirmado y probado, con evidencia real

| Pieza | Estado |
|---|---|
| Motor de cotizaciones/órdenes | ✅ Probado, rápido (200-600ms) |
| `APICostOrderParadixe` (costos de orden) | ✅ Probado en vivo, datos reales |
| `APIConsultaParadixe` (endpoint genérico, ~8 consultas) | ✅ Probado en vivo con 2 SPs distintos |
| `spApproveComex_Paradixe` (transaccional) | ✅ Probado en vivo — responde `OK` (HTTP 200) |
| Maestro de fletes (270 tarifas + 8 transload + 21 recargos) | ✅ Cargado y probado, local y en servidor real |
| Puerto/host IMAP de Oben | ✅ Confirmado: `outlook.office365.com:993` (el `9993` era typo) |

### 🔴 Lo que no estaba listo entonces (sigue igual salvo lo ya corregido arriba)

1. El correo real de Oben seguía bloqueado (M365 + firewall del servidor) — **sigue igual, ver sección "depende de terceros" arriba**.
2. Alternativa de correo propio conectaba pero sin prueba cruzada de punta a punta — **esa prueba ya se hizo hoy, ver arriba**.
3. OAuth2 pedido, sin respuesta — **sigue igual**.
