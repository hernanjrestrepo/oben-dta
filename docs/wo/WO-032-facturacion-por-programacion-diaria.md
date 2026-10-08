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
