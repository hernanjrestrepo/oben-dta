# WO-032 — Facturación guiada por la programación diaria de Oben

**Prioridad:** P1 (la facturación sigue SUSPENDIDA hasta nueva orden) · **Origen:** reunión "Facturación - Oben Xmart", 2026-10-08 (José Guzmán, Jorge Restrepo, Camilo Pérez, Hernán)

## Hallazgo principal
Oben no factura "cuando sale la Lista de Empaque". Factura lo que **Comercial/Despacho programan cada día** en un Excel compartido (en un Drive; lo alimentan 4 o 5 áreas; la dueña es Alejandra). Camilo filtra la columna **"Día de factura" = hoy**, copia eso a su cuadro y factura. El disparador que construimos (factura automática al enviar la Lista de Empaque) **no corresponde a su proceso** y puede facturar pedidos que no tocaba: por eso queda apagado.

## Cómo debe funcionar (lo que se dijo en la reunión)
1. **Fuente:** el sistema lee el Excel cada **5 minutos** (el plan cambia durante el día: de 10 pedidos pueden quedar 9 o 12). Toma lo marcado para facturar hoy e **ignora lo ya facturado**. Busca en todo el archivo: la pestaña se llama como el mes ("Octubre") y la renombran cada mes.
2. **Cambios del plan:** primero avisan por WhatsApp ("añadir esta orden") y luego Despacho/Alejandra actualizan el cuadro; el sistema solo debe mirar el cuadro.
3. **Condiciones para facturar un pedido:**
   - Está en el plan del día.
   - Está **cerrado** (aprobado en corte).
   - Despacho ya **ajustó las cantidades** en el ERP para que cuadren con la Lista de Empaque ("cantidades cambiadas"); si no, la factura sale con cantidades distintas.
   - Un pedido que se cierra **después de las 4 p. m. no se factura ese día**: queda pendiente hasta que Comercial ponga nueva fecha.
   - Un pedido cerrado en días anteriores pero programado para hoy **sí se factura hoy**.
   - Los pedidos "no completos" del cuadro no se facturan.
   - Política: se factura el día del despacho, con excepciones ("facturar pero no entregar", por ejemplo cliente sin pagar).
   - Exportación: primero hay que liquidar. Hoy solo se facturan nacionales.
4. **Fines de semana y festivos:** hay casos especiales que se planean los viernes y se incluyen en el archivo. Festivos: los de Colombia para nacionales; para exportación, los del país destino (EE. UU., Brasil...). **Oben decide las reglas.**
5. **TRM y valores en letras:** las facturas en dólares llevan una conversión y, en las observaciones, los valores en letras (precio, IVA, retención en la fuente). Algunos clientes (PPC Flex) usan una **TRM especial que viene en la orden de compra** (PDF); si no, la TRM del día de internet.
6. **Futuro:** un formulario en Oben Xmart donde la persona encargada marque "proceder con facturación", con trazabilidad, para reemplazar el Excel. Por ahora se sigue con el Excel para no causar traumatismos.
7. **Duplicados:** si se reenvía una factura ya hecha, Oben la rechaza porque los artículos ya están cerrados (confirmado por José).

## Lo que falta (en orden de prioridad)
| # | Falta | Quién |
|---|---|---|
| 1 | **Acceso de lectura al Excel**: dónde está (ruta/plataforma), quién es el dueño, permiso de seguridad y cómo nos autenticamos. José lo consulta con Alejandra y con seguridad informática. Es software instalado en su infraestructura; nada sale de sus servidores | José / Alejandra |
| 2 | **Un ejemplo del archivo**: nombres de las columnas (día de factura, estado facturada/no, "no envía factura", cantidades cambiadas, pedido cerrado, peso), y qué valores usa cada una | Camilo / Alejandra |
| 3 | **Reglas por escrito**: hora de corte (4 p. m., hora de Bogotá) y a qué hora se mide (aprobación en corte), fines de semana, festivos por país, excepciones | Alejandra / Jorge |
| 4 | **TRM y observaciones**: el mensaje de voz y ejemplo de texto exacto que prometió Camilo; si se compara con la TRM del Banco de la República; de dónde sale la TRM especial hasta que exista Comercial | Camilo |
| 5 | **Aviso por correo tras facturar**: hoy NO sale ninguno (el flujo automático no lo manda; Jorge lo notó). Hay que enviarlo a la lista "Facturación" con la PF, la OV y el resultado. Falta saber qué datos devuelve la API al facturar (número de factura) | Hernán / José |
| 6 | **Revisar el caso de ayer**: Jorge dice que la IA hizo la factura de la mañana y no notificó; ver la hora real, y por qué | Hernán |
| 7 | **Cómo saber el estado de un pedido** (cerrado, cantidades ajustadas, facturado) sin depender solo del Excel: ¿hay un procedimiento de Oben? | José |
| 8 | Quién actualiza el Excel y cuándo; qué hacer si dos personas lo editan | Alejandra |

## Plan de construcción (cuando llegue el acceso)
1. Lector del Excel cada 5 minutos (solo lectura), tolerante al cambio de nombre de pestaña.
2. Motor de reglas (corte 4 p. m., fines de semana, festivos por país, excepciones configurables por Oben).
3. Facturación de lo programado con la verificación de resultado ya construida (respuesta ambigua = repetir una vez).
4. Aviso por correo a Facturación y registro en pantalla.
5. TRM y observaciones en letras.
6. Formulario con casilla "proceder con facturación" (fase 2).

**Sigue suspendida** (`settings.facturacion.suspendida = true`) hasta que Jorge dé la orden de reactivar.

## Sprint 1 — Facturación de lo programado (2026-10-13)
Jorge pidió reactivar la facturación nacional el 13-oct y envió el cuadro de "lo que se va a facturar hoy" (20 órdenes con estado CERRADA / POR CERRAR / SALDO PENDIENTE), pidiendo tener en cuenta las particularidades ya enviadas. Mientras no haya acceso al Excel, el cuadro del día se carga a mano.

Construido (backend, sin pantalla todavía):
- Tabla `facturacion_programada` (migración 0024): órdenes programadas por día (OV, proforma, tipo `completa`/`parcial`, estado que traía en el cuadro de Oben).
- Interruptor `settings.facturacion.soloProgramadas`: con él la facturación automática **solo factura lo programado para hoy**.
  - Pedido completo: se factura al cerrar (cuando sale su Lista de Empaque) si está en el cuadro de hoy.
  - Corte: lo que cierra a las 16:00 o después (hora de Bogotá, `settings.facturacion.horaCorte`) no se factura ese día. Lo cerrado en días anteriores y programado para hoy sí.
  - Parcial (saldo pendiente): se factura con su correo "Facturar Parcial" si su proforma está en el cuadro de hoy; nunca como pedido completo.
  - Si la proforma del cuadro no coincide con la que Oben tiene para esa orden, no se factura.
- `POST /facturacion-programada` (carga y reemplaza el cuadro del día; factura en segundo plano lo que ya cerró), `GET /facturacion-programada?fecha=` y `POST /facturacion-programada/facturar`. Permisos `invoices.create` / `invoices.read`.
- Siguen aplicando las reglas anteriores: solo Colombia, una factura por proforma, verificación de respuestas ambiguas, aviso por correo a la lista Facturación y nada si está suspendida.
- Pruebas: `facturacion-programada.spec.ts` (21) con órdenes reales del cuadro del 13-oct.

Particularidades de Camilo (`FAC.pdf`) que la API de factura de Oben NO permite cumplir desde Oben Xmart (solo recibe proforma y número de distribución): retención en "Observaciones 1", campo NOTAS del cliente, TRM especial de PPC FLEX y el estado "Cantidades cambiadas". Deben resolverse en la API de Oben (José) o revisarse en NetSuite antes de emitir.

Pendiente: pantalla para que Oben cargue el cuadro (o lectura automática del Excel / de un correo diario), confirmar con Oben el significado exacto de SALDO PENDIENTE y si "CERRADA" ya implica "Cantidades cambiadas".

### Ajuste del mismo día: los parciales esperan el cierre de su orden (commit f58a255)
Al cruzar el cuadro con los datos reales quedó claro qué significa cada estado:
- **CERRADA**: la orden ya fue aprobada en corte (salió su Lista de Empaque) y no tiene parcial → se factura el pedido completo.
- **SALDO PENDIENTE**: la orden cerró con un parcial que Oben pidió con "Facturar Parcial" → se factura ese parcial (su número de distribución), nunca el pedido completo.
- **POR CERRAR**: aún no la aprueban en corte. Si ya tiene un "Facturar Parcial" (los del viernes 9-oct después de las 4 p. m.), ese parcial espera: se factura solo cuando la orden cierre.

Regla en el código: una orden programada para hoy se factura al cerrar; si su proforma tiene parciales pendientes pedidos antes de ese cierre se facturan esos, y si no, el pedido completo. Un parcial pedido después del último cierre espera el siguiente.

### Reactivación del 13-oct (11:04 a. m., hora de Bogotá)
Orden de Hernán a partir del correo de Jorge ("reactivemos nacional; esto es lo que se va a facturar hoy"). Ajustes en producción: `suspendida:false, nacionalAutomatica:true, parcialAutomatica:true, soloProgramadas:true, horaCorte:"16:00"`. El cuadro (20 órdenes) se cargó desde la imagen del correo; las 20 proformas coincidieron con las que Oben tiene para cada orden.

| Resultado | Órdenes |
|---|---|
| Creadas, confirmadas por Oben | PF 11198 dist. 11153 (FLEXIPACK) → `9089336`; PF 11228 dist. 11140 (LITOPLAS) → `9089337` |
| Oben responde que ya estaban facturadas | PF 11125 dist. 11143 (FLEXO SPRING); PF 11136 (AGRAF, tras respuesta ambigua y verificación) |
| Rechazadas: proforma en "Aprobación pendiente" | PF 11374 y 11441 (PLASMAR), PF 11546 (AMCOR) |
| Rechazadas: HTTP 400 "No se pudo crear la factura de venta" | PF 11416 y 11488 (OBEN DISTRIBUIDORA COLOMBIA) |
| Esperan el cierre (se facturan solas) | OV 10963, 11039, 11155, 11214, 11216, 11263 |
| Exportación (no se facturan) | OV 11209, 11256, 11257, 11268, 11269 (BAYSHORE FILMS, EE. UU.) |

Aprendizajes:
- En el éxito la API devuelve un número en `message` (`9089336`): hay que confirmar con José si es el número de la factura o su identificador interno, y mostrarlo en el aviso.
- "La proforma … se encuentra en estado: Aprobación pendiente" es un rechazo por estado: Oben mismo impide facturar antes de la aprobación. Hoy no se reintenta solo: se reintenta con el botón de la pantalla Facturas.
- Las tres proformas de OBEN DISTRIBUIDORA COLOMBIA que se han intentado (11490 el 7-oct, 11416 y 11488 hoy) fallan con el mismo HTTP 400: José debe revisar ese cliente en la API.

Siguiente sprint propuesto: reintento automático de las rechazadas por "Aprobación pendiente" hasta el corte, pantalla para cargar el cuadro del día (hoy lo carga Paradixe) y número de Oben en el aviso por correo.
