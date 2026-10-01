# WO-030 — Módulo Comercial: APIs de Oben y demo con comercial

**Prioridad:** P1 · **Responsable:** Paradixe / José Guzmán (APIs) · **Origen:** reunión 2026-10-01, 1:22:34–1:23:26, 1:44:45–1:49:56, 1:53:00

## Contexto
Flujo acordado (José, 1:48): llega el correo del cliente → MIA lee y crea la
cotización en OBEN MAS → Planeación cubica → se responde al cliente por el
mismo hilo → el cliente confirma (documento firmado o aprobación por
correo) → pasa a orden de venta en espera de cartera → cartera libera →
orden de venta activa.

El flujo está construido en Oben Xmart pero sin APIs reales de Oben (maestro
de clientes, cotización, orden de venta), sin clientes ni equivalencias
cargados. José se comprometió a entregar las APIs **esta semana** y una data
maestra de proformas activas. Hernán: terminar el fin de semana y entregar
formalmente el lunes 5 o martes 6 de octubre. Customer Service se incluye
sin costo adicional (valor agregado; que Jorge lo tenga presente).

## Alcance
1. Integrar las APIs comerciales que entregue José (cada una probada en solo lectura antes de escribir).
2. Cargar data maestra (clientes, dominios de correo, equivalencias, proformas activas).
3. Ejemplos reales de órdenes de compra para entrenar la lectura (Alejandra).
4. Demo con el jefe de comercial / Alejandra.

## Criterios de aceptación
- Un correo real de cliente genera la cotización en OBEN MAS de pruebas sin digitar.
- La confirmación del cliente convierte la cotización en orden de venta en espera de cartera.

## Dependencias
- APIs comerciales y data maestra (José, comprometido para esta semana).
