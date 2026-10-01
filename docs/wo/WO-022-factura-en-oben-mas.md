# WO-022 — Crear la factura en OBEN MAS (`APICrearInvoiceParadixe`)

**Prioridad:** P1 · **Responsable:** Paradixe / José Guzmán · **Origen:** reunión 2026-10-01, 3:04, 1:11:03, 1:38:14

## Contexto
Objetivo de Oben: del cierre del pedido a la factura en ~2 minutos (hoy ~1 h
40 min), sin digitar cantidades (las reales salen de la lista de empaque).
Fase 1: la factura se **elabora** automáticamente; el envío a la DIAN sigue
manual 1 a 2 meses (decisión de Facturación), luego se automatiza con el
proveedor de factura electrónica.

Hoy Oben Xmart genera el borrador (PDF) y lo envía por correo, pero **no crea
la factura en OBEN MAS**: `APICrearInvoiceParadixe` no está integrada (solo el
manejo de `isSuccessful`/`Code`). El puerto 9098 ya está abierto.

## Alcance
1. Integrar `APICrearInvoiceParadixe` (headers `NumberPF`, `NumberDistribucion` y los demás que confirme José; `Code` 200 = éxito).
2. Flujo automático: lista de empaque → liquidación → factura (pedido completo: `NumberDistribucion` vacío).
3. Pruebas en el servidor de pruebas con los 3 escenarios que pidió Jorge: **exportación** (con liquidación), **nacional total** y **nacional parcial** (ver WO-023).
4. Nunca un POST a la API sin el caso de prueba acordado con José.

## Criterios de aceptación
- Las 3 facturas de prueba quedan creadas en OBEN MAS de pruebas y coinciden con las que haría Facturación a mano.
- Un rechazo de Oben (`isSuccessful: false`) se muestra con su mensaje y no se marca como facturado.

## Dependencias
- José: lista completa de headers, cuerpo y un caso de prueba (proforma cerrada en el OBEN de pruebas).
- WO-021 (liquidación enviada) para el escenario de exportación.
