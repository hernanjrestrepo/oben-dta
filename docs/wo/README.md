# Work Orders — Reunión "Pruebas técnicas facturación automática" (2026-10-01)

Reunión de 2h22m con José Guzmán, Jorge Restrepo y Deibys Hernández (Oben).
Cada punto se verificó contra el código (`sprint2-customer-core`) y contra
producción (`10.50.30.10`) el mismo 2026-10-01.

## Hecho (verificado)

| Tema de la reunión | Evidencia |
|---|---|
| Dirección de entrega, puerto de arribo y de embarque salen de la API de liquidación (José corrigió el SP en vivo, 0:51) | `liquidacion/check-settlement-defaults.ts`; ambos formatos de respuesta (`[{}]` / `{}`) aceptados |
| Incoterm desde el ERP (`spCheckSalesOrderComex_Paradixe`) | commit `0c7aa06` |
| Todas las APIs de liquidación apuntan al servidor de PRUEBAS `192.168.20.12:9098` (pedido de José/Deibys, 0:37) | prod: `liquidacionUrl`, `crearEncLiqUrl`, `crearDetLiqUrl`, `consultaLiquidacionUrl` → .12; Lista de Empaque sigue en producción |
| Error "Oben no devolvió datos de liquidación para PF 11366" | commit `e75b657` |
| Valores provisionales para poder probar mientras llegan los datos (partida 3920.62.00 al 10 %, flete marítimo en 0) | commit `126ccfe` |
| Borrador de factura (PDF) y correo a Facturación | prod: 1 envío real el 2026-10-01 09:39 (OV 11187); destinatarios configurables en la lista de distribución `facturacion` |
| Facturación fase 1 sin envío automático a la DIAN (decisión de Oben, 1:11) | CUFE marcado como simulado; nada se emite a la DIAN |
| Perfiles los administra Oben; usuarios creados | Pantallas Usuarios y Perfiles (Consulta / Transaccional); José y Jorge creados |
| MIA: letra ilegible, foto con uniforme Oben, respuestas legibles | commits `3cf2f05`, `873cc3a`, `ee90e89` |
| VPN que se caía cada ~15 min | guardián en `Documents\Paradixe\vpn-guardian` (Hernán lo confirmó en la reunión, 1:26) |

## Pendiente → Work Orders

| WO | Tema | Prioridad | Bloqueado por |
|---|---|---|---|
| [WO-019](WO-019-maestro-partidas-arancelarias.md) | Maestro de partidas arancelarias (NCM / NALADI) por referencia | P1 | Cuadro de María Escobar (Jorge lo pide) |
| [WO-020](WO-020-fletes-completos-y-actualizacion.md) | Fletes completos (marítimo, gastos portuarios EE. UU.) y actualización automática | P1 | Archivo completo de María Escobar |
| [WO-021](WO-021-liquidacion-envio-real-y-cuadre.md) | Liquidación: envío real al servidor de pruebas y cuadre contra liquidaciones de Oben | P1 | Sesión con María para cuadrar casos |
| [WO-022](WO-022-factura-en-oben-mas.md) | Crear la factura en OBEN MAS (`APICrearInvoiceParadixe`) — 3 escenarios | P1 | Request completo + caso de prueba de José |
| [WO-023](WO-023-facturas-parciales.md) | Facturas parciales por correo (proforma + número de distribución) | P1 | Número de distribución de prueba (José) |
| [WO-024](WO-024-borrador-factura-formato-oben.md) | Borrador de factura idéntico al formato de Oben + correo a COMEX con detalle de liquidación | P2 | Facturas de ejemplo de Oben |
| [WO-025](WO-025-incoterms-completos.md) | Incoterms 2020 completos (maestro estándar) | P2 | Confirmación de conceptos CIF/CIP/DPU (José) |
| [WO-026](WO-026-dueños-listas-distribucion.md) | Dueños por lista de distribución / tipo de reporte | P2 | — |
| [WO-027](WO-027-edicion-reportes-y-formatos.md) | Módulo de edición de reportes y formatos | P3 | Alcance por definir con José |
| [WO-028](WO-028-perfiles-y-ux-menu.md) | Taller de perfiles y reorganización del menú | P2 | Sesión con José |
| [WO-029](WO-029-mia-analitica-gerencial.md) | MIA analítica para gerencia (rangos de fecha, país, gráficas) | P3 | Datos históricos del ERP por API |
| [WO-030](WO-030-modulo-comercial.md) | Módulo Comercial: APIs de Oben y demo con comercial | P1 | APIs comerciales y data maestra (José, "esta semana") |
| [WO-031](WO-031-dominio-y-acceso-red-oben.md) | Dominio corporativo y acceso desde la red de Oben | P2 | IT de Oben |

Entrega acordada: comercial lista esta semana; entrega formal lunes 5 o martes
6 de octubre. Los detalles de forma ("el colorcito") van después de la
entrega (José, 1:45).
