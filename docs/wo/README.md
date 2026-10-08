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

| WO | Tema | Estado | Depende de |
|---|---|---|---|
| [WO-019](WO-019-maestro-partidas-arancelarias.md) | Maestro de partidas arancelarias (NCM / NALADI) por referencia | En espera | Que Oben entregue el cuadro |
| [WO-020](WO-020-fletes-completos-y-actualizacion.md) | Fletes completos (marítimo, gastos portuarios EE. UU.) y actualización automática | En espera | Que Oben entregue el archivo |
| [WO-021](WO-021-liquidacion-envio-real-y-cuadre.md) | Liquidación: envío real y cuadre | Cerrada (Hernán, 2026-10-01) | — |
| [WO-022](WO-022-factura-en-oben-mas.md) | Factura en OBEN MAS | Cerrada (Hernán, 2026-10-01) | — |
| [WO-023](WO-023-facturas-parciales.md) | Facturas parciales por correo (proforma + número de distribución) | Construida 2026-10-01 | Primera factura de prueba (clic en pantalla) |
| [WO-024](WO-024-borrador-factura-formato-oben.md) | Borrador de factura idéntico al formato de Oben + correo a COMEX | En espera | Facturas de ejemplo de Oben |
| [WO-025](WO-025-incoterms-completos.md) | Incoterms 2020 completos con guía visual | Construida 2026-10-01 | — |
| [WO-026](WO-026-dueños-listas-distribucion.md) | Listas: dueños, disparador y qué se envía (+ Enviar ahora) | Construida 2026-10-01 | — |
| [WO-027](WO-027-edicion-reportes-y-formatos.md) | Formatos de correo editables (asunto y texto) | Construida 2026-10-01 (v1) | — |
| [WO-028](WO-028-perfiles-y-ux-menu.md) | Menú agrupado por función (perfiles ya hechos) | Construida 2026-10-01 | — |
| [WO-029](WO-029-mia-analitica-gerencial.md) | MIA analítica para gerencia | En espera | Faltan datos que MIA aún no puede consultar |
| [WO-030](WO-030-modulo-comercial.md) | Módulo Comercial: APIs de Oben y demo | En espera | APIs comerciales de José |
| [WO-031](WO-031-dominio-y-acceso-red-oben.md) | Dominio corporativo y acceso desde la red de Oben | En espera | Que Oben defina |
| [WO-032](WO-032-facturacion-por-programacion-diaria.md) | Facturación guiada por la programación diaria de Oben (Excel compartido, corte 4 p. m., TRM, aviso por correo) | P1 | Acceso al Excel, reglas y TRM de Oben |

Entrega acordada: comercial lista esta semana; entrega formal lunes 5 o martes
6 de octubre. Los detalles de forma ("el colorcito") van después de la
entrega (José, 1:45).
