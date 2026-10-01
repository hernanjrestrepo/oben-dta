# WO-023 — Facturas parciales por correo (proforma + número de distribución)

**Prioridad:** P1 · **Responsable:** Paradixe / José Guzmán · **Origen:** reunión 2026-10-01, 53:28–57:24 y 1:30:20

## Contexto
Una proforma puede facturarse en varias facturas (pedido nacional parcial).
Distribución, con comercial, decide qué sale y "cierra parcial". Acordado con
José: en ese momento llega un correo al buzón de **pedidos de venta** con:
- Asunto: `Proforma <número> factura parcial`
- Cuerpo: número de proforma y número de distribución.

Con esos dos números se llama a `APICrearInvoiceParadixe`; si
`NumberDistribucion` va vacío es pedido completo. José ya envió un correo de
ejemplo (llegó a pedidos de venta). En el OBEN de pruebas los correos están
desactivados, así que la primera prueba se hace digitando el número de
distribución que José entregue.

Hoy Oben Xmart solo tiene una bandera manual "parcial" en el borrador; no lee
el correo ni envía `NumberDistribucion`.

## Alcance
1. Clasificar en el buzón el correo "factura parcial" y extraer proforma + número de distribución (validar formato; nunca adivinar).
2. Llamar la API de factura con `NumberDistribucion` (WO-022).
3. Pantalla: facturar parcial digitando el número de distribución (para la prueba manual y como plan B).
4. Evitar facturar dos veces la misma distribución (idempotencia por proforma + distribución).

## Criterios de aceptación
- Con el correo de ejemplo de José, Oben Xmart identifica proforma y distribución correctas.
- La factura parcial de prueba queda en OBEN MAS de pruebas con las cantidades que montó Distribución.

## Dependencias
- José: número de distribución de prueba y confirmación del formato final del correo.
