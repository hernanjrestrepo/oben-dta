# WO-024 — Borrador de factura idéntico al de Oben + correo a COMEX con la liquidación

**Prioridad:** P2 · **Responsable:** Paradixe / Oben (ejemplos) · **Origen:** reunión 2026-10-01, 1:10:01–1:11:03 y 1:19:17–1:20:59

## Contexto
Jorge recibió el borrador de la OV 11187 y notó que el formato no es el de
las facturas de Oben ("la información es la misma, se cambió el formato").
Acordado: dejarlo idéntico ("entre menos tenga de dónde agarrarse, mejor").
José pidió además que ese correo llegue a ciertas personas de COMEX, con un
cuadro del detalle de la liquidación.

Hoy: el PDF tiene formato propio; los destinatarios ya son configurables en
la lista de distribución `facturacion`; el correo no incluye el detalle de
la liquidación.

## Alcance
1. Replicar el formato de la factura real de Oben (exportación y nacional), con la misma rigurosidad que la Lista de Empaque.
2. Agregar al correo un cuadro con el detalle de la liquidación (flete, seguro, otros gastos, FOB por línea).
3. Crear / documentar la lista de distribución de COMEX para este correo.

## Criterios de aceptación
- Comparado lado a lado con una factura real de Oben, el borrador es igual campo por campo.
- El correo llega a la lista configurada con el cuadro de liquidación.

## Dependencias
- Facturas reales de ejemplo (exportación y nacional). Jorge no las tiene; pedirlas a Facturación o buscar las que se usaron al construir el borrador.
