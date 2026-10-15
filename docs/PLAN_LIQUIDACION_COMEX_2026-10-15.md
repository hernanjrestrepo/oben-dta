# Plan de trabajo — Liquidación con aprobación de Comex
Fecha: 15-oct-2026 · Fuente: reuniones de hoy con Jorge, María, José y Hernán (transcripciones y video) · Revisado y aprobado por Hernán el mismo día ("dale, actualiza el plan y arranca").

## 1. Criterio de negocio

1. **La búsqueda es por PROFORMA**, no por orden de venta. Una proforma puede tener varias OV.
2. **Preliquidación automática:** el sistema calcula la liquidación con los mejores valores (tarifa vigente más barata **para el puerto que dice la proforma**). Queda como **preliquidación**, tentativa.
3. **Comex revisa y puede cambiar** solo lo siguiente:
   - puerto de origen,
   - puerto de destino,
   - naviera,
   - agente / forwarder (flete marítimo),
   - transportador terrestre (Inland, pata 3: Shapiro, Trading, Transborder…),
   - agente aduanero: solo como dato; no cambia valores (Entry e ISF son fijos para todos, María).
4. **Las tarifas salen siempre del tarifario.** Nadie digita un valor de flete, seguro ni otros gastos. Cambiar agente, naviera, transportador o puerto cambia la tarifa de forma automática.
5. **Cada cambio queda en auditoría**, con usuario, fecha, valor anterior y valor nuevo.
6. **Justificación opcional** (decisión de Hernán; José había pedido obligatoria). El reporte de sobrecostos marca en rojo los cambios sin justificación. Motivos sugeridos: espacio / booking, tiempo de tránsito, pedido del cliente, otro.
7. **Aprobación de Comex** como paso final antes de enviar a Oben (ya existe; se ajusta al flujo nuevo).

## 1 bis. Cambio de agente o naviera y orden de compra interna

- La pantalla **permite** que Comex cambie agente, naviera, transportador terrestre o puerto, con la tarifa **tomada del tarifario** (lista de opciones, nunca un valor libre).
- El flete preseleccionado es el más barato vigente para el puerto de la proforma, pero **cambiable**.
- Cada cambio genera una **orden de compra interna** numerada, pegada a la preliquidación: proforma, ruta, agente, naviera, transportador, tarifa anterior → nueva, usuario, fecha y motivo. Se ve en pantalla y sale en PDF. **No se envía** a Oben ni al proveedor (no hay API para eso).
- Observación de la reunión: María toma el Inland **del mismo agente** del flete marítimo ("con quien lo tengo cotizado... Trading"). Por eso eligió Trading 860 y no Shapiro 523. Se confirma con José (pregunta 1.4).

## 2. Valores

| Tema | Acuerdo | Estado |
|---|---|---|
| Flete marítimo | Más barato vigente **al puerto de la proforma**; Comex puede cambiarlo | Corregido el error de puerto (§4) |
| Inland (pata 3) | Más barato vigente al puerto de la proforma; Comex puede cambiar transportador | Corregido el error de puerto (§4) |
| Entry fee | **120** fijo, negociado, igual para cualquier agente (María; Jorge: "va en todas las proformas") | **Pendiente:** el cambio 110 → 120 en la base de prod requiere autorización explícita de Hernán; José confirma |
| ISF | **45** fijo (María) | **Pendiente:** 20 → 45, igual que el Entry |
| HMF | 0,125 % del **FOB final**, que ya tiene descontados Inland, Entry, ISF y el propio HMF | Corregido y desplegado: PF 11237 da 44,34 (antes 45,68) |
| Redondeo | Unitarios **redondeados** a 4 decimales; si la liquidación queda por debajo del valor de la mercancía, al **último ítem** se le resta **0,0001** al flete por unidad | Corregido y desplegado: cuadra con las PF 10867 y 11237 |
| Arancel EE. UU. | 12,5 %, solo informativo hasta que Jorge confirme la base | Ya está así |

## 3. Desarrollo por fases

### Fase 0 — Arreglos de cálculo (primero: cambian los números)
- HMF sobre el FOB final (fórmula cerrada: HMF = 0,125 % × (FOB sin gastos de destino − Inland − Entry − ISF) ÷ 1,00125).
- Redondeo de Oben (redondear + ajuste de 0,0001 al flete del último ítem).
- Ruta: el Inland y el flete marítimo se buscan primero en el puerto/rampa de la ciudad de arribo de la proforma.
- Tarifario: Entry 120 e ISF 45 (origen Colombia).
- **Criterio de aceptación:** PF 11237 con flete 3150 e Inland 860 da precio final 1,9831 y **FOB 35.472,03**, igual que Oben. La PF 10867 sigue dando FOB 55.555,19.

### Fase A — Selector por proforma
- La pantalla busca por PF. La OV queda como dato informativo (una PF puede traer varias).
- **Criterio:** escribir 11208 carga la proforma 11208.

### Fase B — Preliquidación y estado
- Estados: `preliquidada` → `en_revision_comex` → `aprobada` → `enviada`.
- La preliquidación se congela con su huella (valores exactos) para que lo aprobado no cambie sin volver a aprobar.
- **Criterio:** una PF nueva queda preliquidada automáticamente, sin que nadie la toque.

### Fase C — Cambios de Comex con auditoría y orden de compra interna (la más importante)
- Comex elige una opción **de la lista del tarifario** (puerto, agente, naviera, transportador terrestre).
- Al cambiar, se recalculan flete, Inland, HMF, seguro y FOB.
- Registro de auditoría (quién, cuándo, antes → después, motivo opcional) y orden de compra interna (§1 bis).
- Un cambio invalida la aprobación anterior y pide aprobar de nuevo.
- **Criterio:** Comex cambia la PF 11237 de Shapiro (2804 + 523) a Trading (3150 + 860) y queda el registro con el antes, el después y el sobrecosto.

### Fase D — Reportes de sobrecostos
- Sobrecosto frente a la tarifa más barata, con motivo (o "sin justificación" en rojo).
- **Diario** a la supervisora de Comex y **mensual consolidado** a financiera (Hernán: reportes estándar que se mandan solos).
- Reportes abiertos por MIA para gerencia (José).

### Fase E — Cuadro de integración con datos reales
- Depende de las APIs de José (consumo por orden, autorizaciones, costos, maestro de materiales). Hoy funciona con datos simulados y lo marca.

### Fase F — Flujo comercial completo (APIs de Oben)
- Orden: parametrización de cliente → validación del maestro de empaque por SKU → encabezado de proforma → detalle por SKU → aviso a planeación → cubicaje aprobado → proforma en el mismo hilo del correo de la OC → aprobación del cliente → órdenes de venta → liberación de cartera → activación.
- Guardar el PDF de la orden de compra del cliente (auditoría; hoy Comercial lo guarda a mano).
- SKU sin maestro de empaque → aviso a Comercial.
- **Cartera PND** (producir, no despachar): bloquea lista de empaque, liquidación y factura, y se vuelve a consultar antes de la lista de empaque. **Afecta lo que ya está automatizado.**
- Falta la API de liberación de cartera (José la está averiguando).
- Los maestros se consultan cada hora.

## 4. Error de puerto encontrado (PF 11237, Cincinnati)

- La PF dice puerto de arribo **Cincinnati** (ZIP 45240).
- En el tarifario, el Inland de Shapiro desde la rampa de Cincinnati (523) **venció el 30-sep**; el mismo 523 desde la rampa de **Columbus** no tiene vencimiento. El sistema prefería "vigente", tomó Columbus y el flete marítimo lo siguió: Trading / Hapag vía New York a Columbus = **2900**.
- Comex usó: marítimo Trading / Hapag a Cincinnati vía New York **3150** + Inland Trading **860**.
- Arreglo (desplegado el 15-oct): si la ciudad de arribo de la proforma tiene tarifas, solo se buscan ahí. Si no tiene (ej. Dallas, que sale de Houston), se sigue como antes. Oben escribe el puerto como "CINCINNATI OH 45240" (sin coma): también se lee.
- Resultado en prod hoy para la 11237: marítimo Directo / Hapag-Lloyd a Cincinnati **3.151,50** (la única vigente) + Inland Trading **860** (el 523 de Shapiro desde Cincinnati venció).
- Con los valores de Comex (3150 + 860, Entry 120, ISF 45) el sistema da en prod exactamente lo de Oben: HMF 44,34, otros 1.069,34, precio final 1,9831, FOB 35.472,03.
- Pendiente del tarifario: casi todo el marítimo vence el 30-sep (solo "Directo" llega al 31-dic). Hay que pedir a Comex el archivo vigente. **Ojo:** subir un archivo nuevo del forwarder vuelve a poner Entry 110 e ISF 20 (así vienen en su hoja "Destination Surcharges").

## 4 bis. APIs nuevas de Oben (revisión del 15-oct)

- Las 5 APIs que ya usamos responden (Consulta, Liquidación, CostOrder, CrearEnc/DetLiq, CrearInvoice).
- Se probaron ~50 variantes de nombre de las APIs que José describió en la reunión (Customer Parametrization, Valid Product Master Empaque, encabezado y detalle de PF, ActivateOV, cartera, maestros, consumo, autorizaciones) en los 3 servidores (api.obengroup.co, .12:9096, .12:9098), con OPTIONS/GET que no ejecutan nada: **ninguna existe** con la ruta `/api/External/API…Paradixe`. No hay Swagger publicado.
- En el buzón de Oben Xmart no hay correos de José con la documentación desde el 8-oct.
- Falta: el documento o los mensajes donde José "pasó" las APIs (nombres exactos, URL, JSON de ejemplo). Puede que estén con otro prefijo o que sean SP nuevos de APIConsultaParadixe.

## 5. Preguntas — una sola lista, todas para José

1. **Tarifas y costos de destino**
   1. Confirmar Entry fee **120** e ISF **45** fijos (el archivo del forwarder dice 110 y 20). ¿Cambian por agente?
   2. Confirmar la regla del redondeo: unitarios **redondeados** (no truncados) y ajuste de **0,0001** (no 0,001) al flete del último ítem. Con eso cuadran al centavo las PF 10867 y 11237.
   3. HMF sobre el FOB final (ya descontados Inland, Entry, ISF y el propio HMF): ¿así lo calcula Oben? Da 44,34 en la 11237.
   4. ¿El Inland se toma siempre **del mismo agente** del flete marítimo? (María lo hizo así en la 11237.)
   5. ¿Quién mantiene el tarifario y cuándo llega el archivo vigente? (casi todo vence el 30-sep).
2. **Arancel EE. UU.:** ¿12,5 % a todas las películas o solo a algunas? ¿Sobre qué base (FOB, CIF)? ¿Solo con DDP?
3. **OV, liquidación y factura**
   1. "EL ARTÍCULO X NO SE ENCUENTRA EN LA ORDEN DE VENTA": ¿cuándo significa que la factura ya existe?
   2. ¿Existen las facturas de la PF 11218 (dist. 11114) y la PF 11219? ¿Qué número tienen?
   3. PF 11611: sigue en "Aprobación pendiente". ¿Quién la aprueba?
4. **Flujo comercial:** API de liberación de cartera (nombre, cuándo se consulta, respuesta con PND), ejemplos de respuesta de cada API, qué hacer si una falla a mitad (rollback) y dónde guardar el PDF de la OC.
5. **Maestros:** homologaciones de SKU por cliente y códigos secuenciales que piden las APIs de transacciones.
6. **Cuadro de integración:** confirmar las APIs publicadas, cuándo ejecutar cada una y un ejemplo real (certificado 51590).
7. **Servidores:** qué endpoints dan 404 y cuál es el servidor de pruebas vigente.

## 6. Orden

1. **Hoy:** Fase 0 (arreglos de cálculo, ruta y tarifario) + Fase A (selector por proforma). Probado contra las PF 11237 y 10867.
2. **Esta semana:** Fase B (preliquidación) y Fase C (cambios con auditoría y orden de compra interna).
3. **Después:** Fase D (reportes diario y mensual).
4. **Con las APIs de José:** Fases E y F.

## 7. Lo que no hacemos sin confirmación

- Enviar liquidaciones reales a Oben (sigue bloqueado).
- Crear facturas reales.
- Cambiar tarifas sin que pase por el tarifario.
