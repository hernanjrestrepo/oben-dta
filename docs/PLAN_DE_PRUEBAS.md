# Plan de Pruebas — DTA Oben

> Ámbito: EVA, ADÁN y Seguridad. Entorno: servidor `10.50.30.10`.
> Ejecución y resultados reales en `EJECUCION_PRUEBAS.md`. Script: `qa-suite.sh`.

## Suite EVA (order-to-cash)

| ID | Objetivo | Entrada | Resultado esperado |
|---|---|---|---|
| EVA-01 | Cliente válido + cupo + producto + orden + factura | "Quiero 10 SKU-001 para ACME" | orden y factura creadas; counts +1 |
| EVA-02 | Cliente inexistente | "...para NOEXISTE" | GetClient found=false; sin orden |
| EVA-03 | Crédito insuficiente | "Quiero 5 SKU-001 para ZETA" (cupo 0) | bloqueo; sin orden; escala a humano |
| EVA-04 | Producto inexistente | "Quiero 2 SKU-999 para ACME" | GetProduct found=false; sin orden |
| EVA-05 | Orden múltiple (2 productos) | "...4 SKU-001 y 6 SKU-002..." | orden con 2 items |
| — | Generación de factura | (cubierto en EVA-01) | factura persistida con IVA 19% |
| — | Bloqueo automático | (cubierto en EVA-03) | status bloqueado, sin persistir |
| — | Escalamiento humano | (cubierto en EVA-03) | mensaje de escalamiento |

## Suite ADÁN (RAG)

| ID | Objetivo | Entrada | Resultado esperado |
|---|---|---|---|
| ADAN-01 | Búsqueda semántica + recuperación + fuentes | "¿Qué Incoterm para Perú?" | grounded=true; fuentes citadas; respuesta correcta |
| ADAN-02 | Pregunta sin contexto (no inventar) | "¿política de vacaciones?" | reconoce que no hay info en el contexto |
| ADAN-ING | Ingesta multi-formato | PDF/DOCX/XLSX/TXT/MD | documento → chunks → embeddings |

## Suite Seguridad

| ID | Objetivo | Resultado esperado |
|---|---|---|
| SEC-01 | Login correcto | 200 + access_token + refresh_token |
| SEC-02 | Login password incorrecto | 401 |
| SEC-03 | Endpoint protegido sin token | 401 |
| SEC-04 | Endpoint protegido con token | 200 |
| SEC-05 | JWT inválido | 401 |
| SEC-06 | RBAC: SALES no puede borrar orden | 403 |
| SEC-07 | Refresh token | 201 (token renovado) |
| SEC-08 | Escalada de privilegios en register | role forzado a `sales`, no `admin` |
