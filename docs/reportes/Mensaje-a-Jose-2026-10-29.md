**Asunto:** Oben Xmart: gracias por las respuestas; esto es lo que necesitamos para cerrar

José, buenas tardes. Gracias por las respuestas. Del lado nuestro ya dejamos listo lo que pedías: la lista de órdenes de venta que devuelve la API de OV, el PDF de la Proforma adjunto al correo de cubicación y las observaciones en letras. Para terminar necesitamos tu respuesta en los puntos de abajo; el primero es el más urgente.

**1. APIs comerciales en producción (lo más urgente)**
Dices que están en producción desde el 26-oct al mediodía, pero hoy las probamos desde el servidor con nuestro token y siguen sin existir. Responden 404 en `api.obengroup.co/api/External/` y también en `192.168.20.12:9096`: APICustomerParadixe, APITariffDepartureParadixe, APICityStateCountryParadixe, APISalesOrderHeadPFParadixe, APISalesOrderDetailPFParadixe, APISalesOrderOVParadixe y APIActivateOVParadixe. Solo responden en `192.168.20.12:9098` (pruebas). ¿Cuál es la URL base exacta de producción? En cuanto nos la des las conectamos el mismo día.

**2. Varias órdenes de venta por proforma**
Ya leemos la lista (NroOrdenVenta y DetalleSKU). Si una proforma genera varias OV, ¿APIActivateOV activa todas con el CodSecSalesOrderHeadPF, o hay que activar cada una por separado?

**3. Facturas rechazadas**
En tu respuesta a este punto pegaste la misma explicación de la OV, así que seguimos sin saber por qué Oben las rechaza.
- OBEN DISTRIBUIDORA COLOMBIA falla siempre con "No se pudo crear la factura de venta".
- La PF 11422 (distribuciones 11152 y 11165) dio "falta ATRIBUTO ítem".
- Hoy tenemos 10 PF rechazadas con ese mismo mensaje: 11250 (dist. 11204), 11412, 11452, 11467, 11577, 11450, 11231 (dist. 11265), 11063, 10944 y 11555.
- ¿Qué parámetro rechaza cada una? Si la API pudiera devolver el motivo exacto en el mensaje, no tendríamos que preguntarte cada vez.

**4. Por verificar en OBEN MAS**
Estas cuatro quedaron sin respuesta de la API; probablemente sí se crearon. ¿Nos confirmas si están facturadas? PF 11503, PF 11261 (dist. 11247), PF 11423 y PF 11055 (dist. 11298).

**5. Particularidades de facturación (FAC.pdf de Camilo)**
Entendido lo de PPC FLEX: la TRM viene en la orden de compra. Pero la API de factura solo recibe PF y distribución, ¿cómo llega esa TRM a la factura? Tampoco nos dijiste nada sobre estos tres puntos: retención en Observaciones, campo NOTAS del cliente y el estado "Cantidades cambiadas". ¿Los resuelve el ERP solo o hay que mandárselos?

**6. Observaciones de la factura (nacionales)**
Ya las armamos en letras en nuestro PDF: subtotal, IVA, retefuente y total, en pesos y en dólares con TRM. Dos dudas:
- En el ejemplo de Intalpel el subtotal dice 1877631.6416, pero con IVA 35.674.874,94 y total 218.743.486,55 el subtotal debería ser 187.762.690,71. ¿Es un error al transcribir?
- ¿Quién escribe ese campo en la factura de OBEN MAS, el ERP o nosotros? Si somos nosotros, necesitamos que la API de crear factura reciba un campo de Observaciones.

**7. Facturas vacías y consecutivos**
Gracias por el aviso de que está con el proveedor del ERP. Cuando tengan la lista de facturas vacías, compártela para anularlas. Y la API de consulta del estado de facturación por PF sigue pendiente: ¿tiene fecha?

**8. Cartera**
Sigue "en proceso". Mientras tanto la liberación la simulamos y la lista de empaque sale marcada como "cartera no verificada". ¿Hay fecha estimada?

**9. Cuadros de integración de Zona Franca**
Entendido que no habrá APIs. Revisamos la lista de una OV real (11433): el consumo de materia prima y de material de empaque sí viene, por película, con el nombre del material y la cantidad. No viene lo que el certificado necesita: autorización o referencia de Zona Franca (tipo 69256-003), subpartida, valor en US$, % de desperdicio, si es nacional o extranjero y la declaración de importación. ¿De dónde las sacamos? ¿Tienen el maestro de materiales (la hoja BASE del Excel BASEDEXPORTACION) para compartirlo? Además, ¿el nombre del material en la lista de consumo es la clave para cruzarlo con ese maestro?

Gracias,
Hernán
