# WO-021 — Liquidación: envío real al servidor de pruebas y cuadre contra Oben

**Prioridad:** P1 · **Responsable:** Paradixe + José Guzmán / María Escobar · **Origen:** reunión 2026-10-01, 1:03:10 y 1:31:18

## Contexto
En la reunión la liquidación se mostró completa pero con "Simular envío":
en producción no hay ningún envío real de liquidación registrado. El
cálculo aún tiene puntos sin confirmar (`FORMULA_SIN_CONFIRMAR`: redondeo por
línea, ValueFOB por resta vs. precio final × kilos). Hernán: "tenemos que
revisar la liquidación, que esté bien y que funcione con otro ejemplo... sentarnos
con ellos hasta que cuadre".

José también pidió que lo que se liquida en Oben Xmart se vea en OBEN MAS, y
que la liquidación manual de OBEN MAS quede como plan B.

## Alcance
1. Cuadrar 3 a 10 proformas ya liquidadas por Oben (p. ej. PF 10867) contra el cálculo de Oben Xmart; resolver los puntos de `FORMULA_SIN_CONFIRMAR`.
2. Envío real (`confirm: true`) al servidor de pruebas `192.168.20.12:9098`: encabezado + detalle; verificar en OBEN MAS de pruebas que quedó.
3. COMEX puede corregir cualquier valor sugerido antes de enviar (ej. cambio de buque); queda auditado.
4. Disparo automático al generarse la lista de empaque (sin intervención) una vez cuadrado.

## Criterios de aceptación
- Las proformas de referencia dan el mismo resultado que la liquidación de Oben (o la diferencia está explicada y aceptada por José).
- Una liquidación enviada aparece en OBEN MAS de pruebas.
- Reintentar no duplica (idempotencia ya existente).

## Dependencias
- Sesión con María / José con casos reales.
- WO-019 y WO-020 para dejar de usar valores provisionales.
