**Asunto:** Oben Xmart: gracias; quedan 5 puntos concretos

José, gracias por las respuestas. Con eso cerramos las OV múltiples (ya activamos con el CodSecSalesOrderHeadPF), "Cantidades cambiadas" y el subtotal de Intalpel. Quedan estos puntos, en orden de urgencia:

**1. APIs comerciales: fecha**
Dices "se validará". Mientras no existan en producción no podemos conectar comercial. ¿Para qué día nos pueden dar la URL base? Hoy siguen respondiendo 404 todas menos las de `192.168.20.12:9098` (pruebas).

**2. Facturas rechazadas: necesitamos el motivo**
Entiendo que el mensaje viene del proveedor. Aun así hoy hay 10 PF rechazadas con "falta ATRIBUTO ítem" (11250, 11412, 11452, 11467, 11577, 11450, 11231, 11063, 10944, 11555), la 11422 con el mismo mensaje y todas las de OBEN DISTRIBUIDORA COLOMBIA con "No se pudo crear la factura de venta". ¿Puede alguien con acceso al proveedor revisar estas PF en OBEN MAS y decirnos qué atributo del ítem falta? Con eso las corregimos del lado de datos o te las devolvemos con el detalle.

**3. Observaciones de la factura (nacionales)**
Me dices que la API va con OBSERVACIONES vacío para que la llene la IA. La API de crear factura solo recibe `NumberPF` y `NumberDistribucion`, así que no tenemos por dónde enviar ese texto. ¿Qué API o campo debemos usar para escribir las observaciones en la factura de OBEN MAS? Si no existe, ¿se puede agregar un parámetro `Observaciones` a APICrearInvoice?

**4. TRM de PPC FLEX y orden de compra**
Entendido que la OC empezará a llegar al correo de Pedidos Ventas. Para leerla necesitamos: el buzón exacto, un ejemplo real de OC de PPC FLEX y confirmar que la TRM aparece como un campo reconocible. Y la pregunta de fondo: la API de factura no recibe TRM, ¿cómo llega a la factura, la toma el ERP de la OC o la debemos mandar nosotros?
Siguen sin respuesta la retención en Observaciones y el campo NOTAS del cliente (FAC.pdf de Camilo).

**5. Zona Franca: Hoja de Costo y hoja BASE**
Consultamos la Hoja de Costo de la OV 11433 (línea 7). Trae por material: nombre, cantidad, `Nacionalizada` (SI/NO), % de desperdicio, costo unitario y costo total. Con eso cubrimos origen nacional/extranjero, desperdicio y valor. **No trae**: autorización o referencia de Zona Franca (tipo 69256-003), subpartida arancelaria ni declaración de importación. ¿Esos tres vienen en otro campo o API? Si no, dependen de la hoja BASE que enviará María Escobar: ¿puedes pedirle una fecha?

**Pendientes de Oben (para registro)**
- Confirmar si están facturadas PF 11503, 11261 (dist. 11247), 11423 y 11055 (dist. 11298): respuesta prometida para mañana por la mañana.
- API de estado de facturación por PF, cartera y lista de facturas vacías: sin fecha.

Gracias,
Hernán
