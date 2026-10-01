# WO-029 — MIA analítica para gerencia

**Prioridad:** P3 (después de la entrega) · **Responsable:** Paradixe / Oben (datos) · **Origen:** reunión 2026-10-01, 1:09:16, 1:52:22–2:01:32

## Contexto
En la reunión se le pidió a MIA "cuánto hemos despachado, cuántos
contenedores, cuántos kilos, precio promedio del contenedor" y un reporte de
ventas por país y periodo; hoy MIA no consulta por rango de fechas. Objetivo
de Hernán: que la alta gerencia pida cualquier reporte chateando con MIA. José:
"la MIA tenemos que pulirla... el funcionamiento", y el valor crece cuando
entre Comercial (y luego despacho y producción).

## Alcance
1. Herramientas de MIA por rango de fechas y país: despachos, contenedores, kilos, valor, precio promedio, top clientes y destinos.
2. Gráficas en el chat y descarga del reporte (Excel / PDF).
3. Fuentes: datos de Oben Xmart + consultas del ERP; donde el ERP no exponga histórico, pedir a José el SP correspondiente (nunca estimar cifras).

## Criterios de aceptación
- "Ventas de septiembre por país" devuelve cifras que cuadran con el ERP.
- La respuesta trae gráfica y botón de descarga.

## Dependencias
- SP / API de Oben con histórico de ventas por fecha (por confirmar con José).
- WO-030 (datos comerciales).
