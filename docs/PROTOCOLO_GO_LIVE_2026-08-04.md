# Protocolo Go-Live — Piloto Oben (actualizado)

**Estado real ahora mismo: NO está al 100%.** Hay una pieza confirmada rota (el envío automático por correo real) y una pieza que depende 100% de Oben (autenticación). Este documento dice exactamente qué funciona, qué no, y qué hacer mañana para que no haya sorpresas.

---

## ✅ Lo que SÍ está confirmado y probado, con evidencia real

| Pieza | Estado |
|---|---|
| Motor de cotizaciones/órdenes | ✅ Probado, rápido (200-600ms) |
| `APICostOrderParadixe` (costos de orden) | ✅ Probado en vivo, datos reales |
| `APIConsultaParadixe` (endpoint genérico, ~8 consultas) | ✅ Probado en vivo con 2 SPs distintos |
| `spApproveComex_Paradixe` (transaccional) | ✅ **Probado en vivo hoy** — responde `OK` (HTTP 200). José confirmó que los UPDATE están desactivados del lado de Oben, así que es seguro repetir la prueba las veces que haga falta sin riesgo |
| Maestro de fletes (270 tarifas + 8 transload + 21 recargos) | ✅ Cargado y probado, local y en servidor real |
| Puerto/host IMAP de Oben | ✅ Confirmado: `outlook.office365.com:993` (el `9993` era typo) |

## 🔴 Lo que NO está listo — honesto, sin adornos

**1. El correo real de Oben sigue bloqueado (no es nuestro, es de ellos)**
`outlook.office365.com:993` conecta perfecto a nivel de red, pero Microsoft 365 rechaza el login con **"Login is disabled"** (autenticación básica desactivada). Mismo bloqueo en SMTP. **Esto depende 100% de que el admin de M365 de Oben haga algo** — no hay nada más que podamos probar de nuestro lado con ese buzón.

**2. Encontré un segundo bloqueo, independiente del anterior: el servidor de Oben no tiene salida a internet en los puertos de correo**
Probé la conexión desde el servidor real (`10.50.30.10`) y solo tiene salida abierta por el puerto 443 (HTTPS). Los puertos 993 (IMAP) y 587 (SMTP) están bloqueados de salida — **esto bloquearía el correo aunque Microsoft habilitara todo**, porque el servidor ni siquiera puede intentar la conexión. Esto es un firewall de red, no depende de Microsoft.

**3. Probé una alternativa (correo propio) para no depender de Oben — SÍ funciona, con una condición**
Configuré el conector contra `ceo@paradixe.xyz` (proveedor sin el bloqueo de Microsoft) desde mi máquina local, donde sí hay salida libre a esos puertos. **La conexión IMAP real se estableció correctamente** ("IMAP conectado" en el log, confirmado en vivo). Al principio pareció que el correo de prueba no se procesaba — investigando a fondo encontré que **el problema era mi método de prueba, no el conector**: los correos que esa cuenta se manda a sí misma (mismo remitente y destinatario) no llegan a la bandeja de entrada en este proveedor, así que nunca había nada nuevo que el conector pudiera procesar. **Para la demo real esto no aplica** — los correos van a venir de cuentas distintas (José, su equipo), exactamente el escenario que sí funciona. Cambié además el modo de detección de "esperar notificación" a "revisar cada 5 segundos" (más simple y predecible para un demo en vivo).

**4. OAuth2 — ya lo pedimos, no ha llegado**
Le pedimos a Fabián/Jorge de Oben que registren una app en Azure AD y nos den Tenant ID + Client ID + Client Secret. Esto evitaría los dos problemas de arriba (no usa autenticación básica), pero aún no lo tenemos, y aunque llegue hoy, integrarlo es trabajo de desarrollo real, no una config de 5 minutos.

---

## Mi recomendación concreta para mañana

**Buenas noticias tras depurar el bug:** el conector con correo propio (`ceo@paradixe.xyz`) sí conecta y sí está listo para procesar correos de remitentes distintos — que es exactamente el escenario real del demo (José/su equipo enviando, no auto-envíos). Aun así, **antes de la demo debemos hacer una prueba cruzada real** (alguien externo a esa cuenta le manda un correo) para confirmar el flujo completo de punta a punta con evidencia, no solo con la conexión.

**Plan A (preferido):** usar `ceo@paradixe.xyz` como buzón real del demo — José/su equipo mandan los correos de prueba ahí, el sistema los procesa solo, en vivo, frente a los clientes.

**Plan B (respaldo, si algo falla en el momento):** disparar el mismo paso directo contra la plataforma (mismo motor, mismo resultado, sin depender del buzón), explicando con transparencia: *"así se ve el resultado del flujo — la conexión del buzón oficial de Oben sigue pendiente de una autorización de TI de Microsoft, ya solicitada."* Es una explicación honesta y normal en un piloto.

## Qué está pendiente de parte de Oben, para hoy en la tarde

1. **Confirmar si van por autenticación básica o por OAuth2** (les mandamos ya los pasos exactos para OAuth2 vía Fabián — registro de app en Azure AD, permisos `Mail.Read`/`Mail.Send`, consentimiento de admin, y pasarnos Tenant ID + Client ID + Client Secret).
2. **Si van por autenticación básica:** que el admin de M365 la habilite para `pedidosdeventa.co@obengroup.com`.
3. **Que su equipo de red confirme si pueden abrir salida en los puertos 993 y 587** desde el servidor `10.50.30.10` (esto es aparte de lo de Microsoft — son dos problemas distintos, los dos hay que resolverlos).

Nada de esto bloquea la demo de mañana si usamos el plan recomendado arriba — son mejoras para dejar el correo real funcionando después, no requisitos para mostrar el sistema funcionando mañana.
