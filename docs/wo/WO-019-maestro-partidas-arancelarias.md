# WO-019 — Maestro de partidas arancelarias (NCM / NALADI) por referencia

**Prioridad:** P1 · **Responsable:** Paradixe (carga y uso) / Oben (datos) · **Origen:** reunión 2026-10-01, 6:13–17:40 y 1:17:58

## Contexto
La liquidación pide `Partida arancelaria NCM` y `Partida arancelaria NALADI`.
Hoy COMEX las digita a mano en OBEN MAS. En la reunión se acordó que cada
referencia tiene su partida y que no debe depender de lo que escriba una
persona. Mientras llega el cuadro, producción usa un valor provisional
(`3920.62.00`, arancel 10 %) marcado como tal.

## Alcance
1. Tabla `partida por referencia` (SKU / material → NCM, NALADI, % arancel) por tenant.
2. Carga desde Excel (mismo patrón de la carga de tarifas de flete) y edición en pantalla por COMEX.
3. La liquidación toma la partida de la tabla; sin partida para una referencia, la liquidación se bloquea con mensaje claro (nunca se inventa).
4. Quitar el valor provisional cuando la tabla tenga todas las referencias de las proformas abiertas.

## Criterios de aceptación
- PF 11366 se liquida con la partida real de su referencia, sin digitar.
- Una referencia sin partida muestra "falta partida para <SKU>" y no se envía a Oben.
- Cambiar una partida en la tabla se refleja en la siguiente liquidación.

## Dependencias / preguntas
- Cuadro de partidas por referencia: Jorge se lo pide a María Escobar.
- Preguntar a María si la toma de alguna fuente (OBEN MAS u otra); si existe, se lee de allí en vez de cargar Excel (José, 17:17).
