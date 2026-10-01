# WO-020 — Fletes completos y actualización automática del cuadro

**Prioridad:** P1 · **Responsable:** Paradixe / Oben (María Escobar) · **Origen:** reunión 2026-10-01, 18:19–44:19

## Contexto
El archivo de fletes que compartió María (reenviado por José en la reunión)
trae Inland, Transload y "Destination Surcharges" solo para Perú, El Salvador,
Colombia y Brasil. **No trae flete marítimo ni gastos portuarios / impuestos
de Estados Unidos.** Hoy la liquidación usa flete marítimo en 0 (provisional).
El cuadro cambia mensualmente y lo manejan María Escobar, Elías Maya y Diana
Echeverry.

## Alcance
1. Cargar flete marítimo por ruta y gastos portuarios / impuestos de EE. UU. cuando María los entregue.
2. Actualización automática: el archivo mensual llega por correo al buzón de pedidos de venta; Oben Xmart lo detecta, lo lee y actualiza las tablas (con auditoría de qué cambió). Alternativa: leerlo del Drive donde ya lo manejan.
3. Alerta cuando una tarifa usada esté vencida (hoy Dallas 75212 venció el 31-ago).

## Criterios de aceptación
- Una liquidación DAP/DDP a EE. UU. calcula flete marítimo y gastos de destino sin digitar.
- Al llegar un archivo nuevo al buzón, las tarifas se actualizan solas y queda registro.

## Dependencias / preguntas (para María)
- Flete marítimo: ¿dónde está?
- Gastos portuarios e impuestos de EE. UU.: ¿dónde están?
- ¿Acepta reenviar el archivo mensual al buzón de pedidos de venta, o compartir el Drive?
