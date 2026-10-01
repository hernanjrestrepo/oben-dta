# WO-025 — Incoterms 2020 completos (maestro estándar)

**Prioridad:** P2 · **Responsable:** Paradixe / José Guzmán (confirmación) · **Origen:** reunión 2026-10-01, 58:37–1:01:43 y 1:18:34

## Contexto
La pantalla muestra 6 Incoterms (DAP, DDP, CFR, CPT, FCA, FOB). José preguntó
por EXW, que no aparece. Acordado: poner todos los Incoterms; son estándar
mundial y no deben quedar para que alguien los "invente" (José habló de un
"maestro de Incoterms").

Regla actual (`liquidacion/incoterm-rules.ts`): un Incoterm sin regla
confirmada por Oben **bloquea** la liquidación en vez de suponer.

## Alcance
1. Agregar los 11 Incoterms 2020: EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP.
2. Para cada uno, qué conceptos lleva la liquidación (flete / seguro / otros gastos), según la definición estándar, **confirmado por José** antes de activarlo.
3. Maestro de solo lectura para los usuarios (solo administración puede ajustar, con auditoría).
4. Ajustar el diseño de la pantalla para 11 opciones.

## Criterios de aceptación
- Una proforma EXW, CIF, CIP, FAS o DPU se liquida con los conceptos confirmados.
- Ningún usuario operativo puede cambiar qué conceptos lleva un Incoterm.

## Pregunta para José
- Confirmar conceptos de EXW, FAS, CIF, CIP y DPU (propuesta estándar: EXW/FAS ninguno; CIF/CIP flete + seguro; DPU flete + seguro + otros).
