# WO-033 — Cuadro de integración (Certificado de Integración de Zona Franca) y reglas de factura NetSuite

**Estado:** Aprobada por Hernán (2026-10-12); construida con datos SIMULADOS, a la espera de las APIs de José · **Origen:** archivos de Oben del 2026-10-12: `cuadrint-9010468303-1008838.pdf`, `FAC.pdf`, `BASEDEXPORTACION.xlsx`; mensajes de José ("terminé todos los JSON y Maestros", "quiero salir de los cuadros de integración").

## Qué es el "cuadro de integración" (aclarado)
No es la liquidación de exportación. Es el **Certificado de Integración de Materias Primas e Insumos Nacionales y Extranjeros** que Oben presenta en la Zona Franca Permanente Internacional del Atlántico (formulario 1008838, certificado 51590, destino "Al resto del mundo", presentado 2026-09-23). Por cada producto elaborado lista: insumos nacionales, insumos extranjeros (cada uno atado a su autorización/declaración de importación, p. ej. `69256-003`), desperdicios del proceso y otros costos (mano de obra, gastos operativos, utilidad), con el % de participación nacional/extranjera.

## Cómo lo arman hoy (Excel `BASEDEXPORTACION.xlsx`)
`ACTUALIZAR` (consumo de la orden, tabla dinámica) → `BASE DETALLADA` (BUSCARV contra `E FRANCO`: autorización y declaración por descripción; contra `BASE`: UMB, % desperdicio, nacionalizado SI/NO) → `CUADRO INTEGRACION` (referencia, cantidad con +5 % desperdicio y +10,5 % regranulado, código producto). `RECUPERADO-REGRANULADO` cuadra masas (24.654,7 − 901,1 = 23.753,6 = producto 22.080,76 + recuperado 1.672,84, igual al PDF). `COSTOS OBEN` trae el consumo por orden con las columnas de costo/IVA **vacías**.

## Datos que hay y que faltan
| Dato del certificado | Fuente hoy | Estado |
|---|---|---|
| Producto elaborado y cantidades | Excel (cuadra con el PDF) | Hay, falta que salga del ERP |
| Consumo por insumo y orden | `ACTUALIZAR` (manual) | Pendiente API de José |
| Autorización/declaración por insumo | `E FRANCO` (688 filas, 305 descripciones, 339 sin código MP, variantes con errores de digitación) | Hay, pero sucio |
| % desperdicio, nacionalizado, conversión de unidades | `BASE` (~1.000 materiales) | Hay |
| Subpartida arancelaria por insumo | Solo en el PDF | **Falta** en el Excel |
| Valor US$ por insumo y costo de producto | `COSTOS OBEN` vacío | **Falta** (ERP/Costos) |
| Otros costos (mano de obra, gastos, utilidad) | Solo en el PDF | **Falta** |
| Unidades → kg (estibas, etiquetas, conos) | Parcial (`CONVERSION`) | Falta tabla completa |
| Formato de carga a la Zona Franca | PDF impreso desde el software ZF (usuario OPP.02) | Por definir: ¿archivo/API de la ZF? |

## Procedimiento de factura NetSuite (`FAC.pdf`) → requisitos para WO-032
1. Primer guardado cambia subtotal e IVA: se copian antes y el total se registra después.
2. Retención (reteIVA/retefuente) según cliente: va en "Observaciones 1" con tipo y valor.
3. El campo NOTAS de algunos clientes debe reflejarse en la observación.
4. Solo facturar con estado **"Cantidades cambiadas"** en el cuadro de estatus de facturación.
5. PPC FLEX: TRM especial por orden de compra (la entrega Servicio al Cliente).

## Pendiente de Oben / decisiones
Ver el mensaje a José en la conversación del 2026-10-12. Sin las APIs (consumo por orden, maestro de autorizaciones, costos por insumo) solo se puede construir con datos simulados (política de simulación).

## Construido (2026-10-12, con datos simulados)
`backend/src/modules/cuadro-integracion/`: `GET /cuadro-integracion/:orden` y `/:orden/excel` (solo lectura, permiso `exportations.liquidate`).
- **Fórmula verificada contra el certificado 51590**: MP: cantidad = consumo × (1 + %desperdicio + %regranulado); ME: cantidad = consumo, desperdicio aparte; % desperdicio impreso = desperdicio / cantidad sobre valores redondeados. Las 11 materias primas, los desperdicios y las participaciones (51,90 % / 1,52 % / 46,58 %) coinciden.
- **Cuadre de masas**: consumo de MP (22.080,77 kg) = producto elaborado sin recuperado (22.080,76 kg).
- **Avisos** de lo que falta: referencia sin maestro, sin costo, sin conversión a kg, masa que no cuadra.
- **Fuente**: `CuadroIntegracionFuenteSimulada` (certificado 51590). Al llegar las APIs de José se agrega otra implementación de `CuadroIntegracionFuente` y se cambia el proveedor del módulo; el cálculo no cambia.
- Pruebas: 7 nuevas (suite completa 999 en verde).

## Sin confirmar con Oben
1. Qué significa NACIONALIZADO SI/NO del Excel frente a la separación nacional/extranjero del certificado (no coinciden: 13 SI vs 17 extranjeros). Hoy el origen es un campo del maestro.
2. Convención de la cantidad de insumos nacionales y de empaque (se toma el consumo, sin sumar desperdicio).
3. Subpartida y costo por insumo, y otros costos (mano de obra, gastos, utilidad): vienen del PDF, no del Excel.
4. Cómo se entrega a la Zona Franca (archivo/API o digitado).
