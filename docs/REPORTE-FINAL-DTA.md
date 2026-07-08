# Reporte Final — DTA Oben (EVA + ADÁN, 100% local)

> Fecha: 2026-06-22 · Servidor Oben `10.50.30.10` (`coitsvphap03`) · Sin APIs externas pagas.
> Toda afirmación está respaldada por una prueba ejecutada.

## 1. Modelo seleccionado (benchmark real, no estimado)

Benchmark de 3 modelos en el servidor (Xeon Silver 4210, 15 GB RAM, sin GPU):

| Modelo | RAM en uso | Latencia (orden) | Tokens/s | Calidad | Resultado |
|---|---|---|---|---|---|
| **qwen2.5:3b** | ~2 GB | 12.4 s | ~10 | fiel, no alucina | 🏆 **GANADOR** |
| qwen2.5:7b | ~4.7 GB (354 Mi libres) | 26.8 s | ~5 | alucinó datos de factura | descartado |
| llama3.1:8b | ~4.9 GB | 28.6 s | ~4.8 | aceptable | descartado |

Embeddings: **nomic-embed-text** (768 dim, local).
Evidencia cruda: `/opt/dta/benchmark-results.md` y `/opt/dta/benchmark-llama.md` en el servidor.

## 2. Arquitectura desplegada

```
Navegador (VPN) ──► Frontend Next.js :3000 ──► Backend NestJS :3004 ──► PostgreSQL+pgvector :5432
                                                      │
                                                      └──► Ollama :11434 (qwen2.5:3b + nomic-embed-text)
```
Todo en Docker en el servidor, salvo Ollama (nativo systemd). 4 contenedores: postgres(pgvector), redis, backend, frontend — todos `healthy`.

## 3. EVA — order-to-cash autónomo (sin regex, sin hardcode, sin IDs ficticios)

Pipeline real: lenguaje natural → LLM local → tool calling → persistencia.
Herramientas reales: `GetClient`, `GetProduct`, `ValidateCredit`, `CreateOrder`, `CreateInvoice`.

### CASO 1 — "Quiero 10 SKU-001 para ACME" (en el servidor)
```
orders   ANTES = 0  →  DESPUÉS = 1
invoices ANTES = 0  →  DESPUÉS = 1
ORD-20260622-0001 | $1.200.000 | factura INV-20260622-0001
INV-20260622-0001 | base $1.200.000 | IVA $228.000 | total $1.428.000
```

### CASO 2 — "Quiero 5 SKU-001 para ZETA" (cliente sin cupo)
```
ValidateCredit → CV-20260622-0002 REJECTED (isCreditSufficient=false)
EVA NO creó orden (orderNumber=null) → bloqueo + escalamiento
```

## 4. ADÁN — memoria corporativa RAG (sin fine-tuning)

Pipeline: documento → chunking → embeddings (nomic-embed-text) → pgvector → recuperación semántica → respuesta citada.

### CASO 3 — "¿Cuál es el procedimiento para exportar a Perú?" (en el servidor)
```
grounded = true · model = qwen2.5:3b
Documento: procedimiento-exportacion-peru.md (4 chunks, 4 embeddings)
Fuentes citadas: #0 (sim 0.81), #1 (0.69), #2 (0.68), #3 (0.66)
Respuesta basada en el documento real (NetSuite, VETA, CAN, Incoterm CIF Callao, DIAN).
```

## 5. Acceso

- **URL (vía túnel SSH):** http://localhost:3000  → ver instrucciones de túnel abajo
- **URL (directa, requiere abrir puertos):** http://10.50.30.10:3000
- **Usuario:** `admin.demo@oben.com`
- **Contraseña:** `DtaAdmin2026!`

### Nota de red (honesta)
El firewall corporativo / ACL de la VPN solo permite SSH (puerto 22) hacia el servidor;
los puertos 3000/3004 NO están expuestos a las máquinas cliente (ufw del servidor está inactivo,
el bloqueo es aguas arriba). Dos caminos de acceso:
1. **Inmediato:** túnel SSH (no requiere IT).
2. **Producción:** IT de Oben abre 3000/3004 en el firewall → acceso directo por IP.

## 6. Estado final de servicios (servidor)
```
dta-postgres  (pgvector/pgvector:pg16)  healthy
dta-redis     (redis:7-alpine)          healthy
dta-backend   (NestJS, /health = ok)    healthy
dta-frontend  (Next.js, /login = 200)   up
ollama (systemd, 0.0.0.0:11434)         active · qwen2.5:3b + nomic-embed-text
```
