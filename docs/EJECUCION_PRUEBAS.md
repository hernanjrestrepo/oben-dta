# Ejecución de Pruebas — DTA Oben (evidencia real)

> Ejecutado en el servidor `10.50.30.10` el 2026-06-22. Evidencia cruda: `/opt/dta/qa-evidence.txt`.
> Cada resultado es salida real del sistema, no simulada.

## Suite EVA

| ID | Entrada | Resultado obtenido | Estado |
|---|---|---|---|
| EVA-01 | "Quiero 10 SKU-001 para ACME" | ORD-20260622-0002 + INV-20260622-0002; orders 1→2, invoices 1→2 | ✅ PASA |
| EVA-02 | "...para NOEXISTE" | trace `GetClient:False`; orderNumber null; "El cliente NOEXISTE no existe" | ✅ PASA |
| EVA-03 | "Quiero 5 SKU-001 para ZETA" | orderNumber null; "ZETA no tiene crédito... se bloquea... a un humano" | ✅ PASA |
| EVA-04 | "Quiero 2 SKU-999 para ACME" | orderNumber null (no creó orden) | ✅ PASA (función) · ⚠️ mensaje del modelo atribuye mal la causa |
| EVA-05 | "Quiero 4 SKU-001 y 6 SKU-002 para ACME" | ORD-20260622-0003 con items `[{SKU-001:4},{SKU-002:6}]`; orders 2→3 | ✅ PASA |

**Nota EVA-04:** funcionalmente correcto (no se creó orden con producto inexistente),
pero el texto final del modelo `qwen2.5:3b` mencionó al cliente en vez del producto.
Limitación conocida del modelo pequeño en la redacción final; no afecta la persistencia.

## Suite ADÁN

| ID | Entrada | Resultado obtenido | Estado |
|---|---|---|---|
| ADAN-01 | "¿Qué Incoterm para Perú?" | grounded=true; 4 fuentes; "El Incoterm estándar para Perú es CIF Callao" | ✅ PASA |
| ADAN-02 | "¿política de vacaciones?" | grounded=true; "No hay información sobre la política de vacaciones en el contexto" | ✅ PASA (no inventó) |

## Suite Seguridad

| ID | Resultado obtenido | Estado |
|---|---|---|
| SEC-01 | 200; access_token + refresh_token presentes; role=admin | ✅ PASA |
| SEC-02 | HTTP 401 (password incorrecto) | ✅ PASA |
| SEC-03 | HTTP 401 (sin token) | ✅ PASA |
| SEC-04 | HTTP 200 (con token) | ✅ PASA |
| SEC-05 | HTTP 401 (JWT inválido) | ✅ PASA |
| SEC-06 | HTTP 403 (SALES intenta DELETE orden) | ✅ PASA |
| SEC-07 | 401 con `refresh_token`, 201 con `refreshToken` → **corregido** para aceptar ambos | ✅ PASA (tras fix) |
| SEC-08 | register con role=admin → usuario quedó `sales` | ✅ PASA |

## Hallazgos y acciones

1. **SEC-07 (corregido):** `/auth/refresh` solo aceptaba `refreshToken` (camelCase) mientras
   login devuelve `refresh_token` (snake_case). Se modificó el endpoint para aceptar ambos.
   Archivo: `backend/src/modules/auth/auth.controller.ts`.
2. **EVA-04 (limitación conocida, no bug):** redacción final imprecisa del modelo 3b cuando
   el producto no existe. No afecta la lógica ni la persistencia. Mitigable subiendo a 7b
   (a costa de RAM/latencia) o afinando el prompt de cierre.

## Resumen
- EVA: 5/5 funcional ✅ (1 nota de redacción del modelo)
- ADÁN: 2/2 ✅ (incluye no-alucinación)
- Seguridad: 8/8 ✅ (1 fix aplicado)
