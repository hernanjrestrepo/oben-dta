# Mapa de Arquitectura Real — DTA Oben

> Fecha: 2026-06-22 · Basado en evidencia verificada (no en diseño aspiracional).
> Regla: solo se documenta lo que está corriendo y fue comprobado por comando.

## Resumen en una línea

Hoy **toda la aplicación DTA corre en Docker en la máquina local de desarrollo**.
El **servidor Oben (10.50.30.10)** solo tiene, por ahora, la **infraestructura de IA
recién instalada** (Docker + Ollama). La app **aún no está desplegada en el servidor**.

---

## 1. Máquina local de desarrollo (Windows)

Aquí vive el código y **todos los datos reales** (único PostgreSQL con datos).

| Componente | Dónde corre | Imagen / Stack | Estado | Puerto host |
|---|---|---|---|---|
| PostgreSQL DTA | Docker | `postgres:16-alpine` | healthy | 5433→5432 |
| Redis DTA | Docker | `redis:7-alpine` | healthy | 6381→6379 |
| Backend NestJS | Docker | build `../backend` | healthy | 3004 |
| Frontend Next.js | Docker | build `../frontend` | up | 3000 |

Datos reales en `dta_db` (verificado): `clients=5`, `products=3`, `orders=6`,
`order_items=4`, `users=9`, `invoices=0`, `credit_validations=0`.
Extensiones instaladas: `plpgsql`, `uuid-ossp`. **`pgvector` NO disponible** en la
imagen alpine actual (bloqueante para ADÁN — resuelto vía `docker-compose.pgvector.yml`).

> Nota: en la misma máquina corre además un proyecto separado `ato-*`
> (ato-api, ato-worker, ato-frontend, ato-postgres, ato-prefect) que **no es parte
> de DTA Oben** y no comparte base de datos.

---

## 2. Servidor Oben (10.50.30.10 · `coitsvphap03`)

Acceso: VPN FortiClient + SSH (`paradixexyz`). Hardware: Xeon Silver 4210, 15 GB RAM,
**sin GPU**, Ubuntu 24.04.4.

| Componente | Dónde corre | Versión | Estado | Bind |
|---|---|---|---|---|
| Docker Engine | nativo (systemd) | 29.6.0 | activo, **0 contenedores** | — |
| Docker Compose | plugin | v5.1.4 | disponible | — |
| **Ollama** | **nativo (systemd), NO Docker** | 0.30.10 | **activo** | `127.0.0.1:11434` |
| App DTA (back/front/db) | — | — | **NO desplegada** | — |

Confirmado: no hay repo de la app en el servidor, ni puertos 3000/3004/5432 escuchando.
Solo existe `/opt/dta/benchmark-results.md` (resultados del benchmark en curso).

### Hallazgo de red para el despliegue (Fase 3)
Ollama escucha **solo en `127.0.0.1:11434`**. Cuando el backend DTA se despliegue en
Docker en este servidor, **no podrá alcanzar Ollama** salvo que:
- se exponga Ollama con `OLLAMA_HOST=0.0.0.0` (env del servicio systemd), **o**
- el contenedor backend use `network_mode: host` / `extra_hosts: host.docker.internal`.

---

## 3. Qué corre en Docker vs fuera de Docker

| Capa | En Docker | Fuera de Docker (nativo) |
|---|---|---|
| Local | Postgres, Redis, Backend, Frontend DTA (+ stack ato-*) | — |
| Servidor | (nada aún) | Docker Engine, Ollama (systemd) |

**Decisión arquitectónica pendiente:** Ollama en el servidor queda **nativo** (systemd),
no en Docker, para evitar overhead y simplificar acceso a CPU. El resto del stack DTA
(Postgres+pgvector, Backend, Frontend) sí irá en Docker Compose cuando se despliegue.

---

## 4. Diagrama lógico

```
┌────────────────────────── LOCAL (dev, Windows) ──────────────────────────┐
│  Docker Compose (docker/docker-compose.yml)                              │
│   ┌──────────┐  ┌────────┐  ┌─────────────┐  ┌──────────────┐           │
│   │ postgres │  │ redis  │  │ backend     │  │ frontend     │           │
│   │ :5433    │◄─┤        │◄─┤ NestJS :3004│◄─┤ Next.js :3000│           │
│   │ (datos   │  └────────┘  │ (EVA tools, │  │ (Centro IA)  │           │
│   │  reales) │              │  Invoices)  │  └──────────────┘           │
│   └──────────┘              └─────────────┘                              │
└──────────────────────────────────────────────────────────────────────────┘

┌────────────────── SERVIDOR OBEN (10.50.30.10, Ubuntu) ───────────────────┐
│  systemd:                                                                 │
│   • Docker Engine 29.6.0  (0 contenedores — app NO desplegada)            │
│   • Ollama 0.30.10  ─►  127.0.0.1:11434  (CPU-only, sin GPU)              │
│                          modelos en benchmark: qwen2.5:3b/7b, llama3.1:8b │
└──────────────────────────────────────────────────────────────────────────┘
        ▲
        │ VPN FortiClient + SSH (paradixexyz)
        │
   Máquina local
```

---

## 5. Brechas conocidas (para cerrar antes de producción)

1. **App no desplegada en servidor** — hoy solo local. El despliegue remoto es trabajo aparte.
2. **pgvector ausente** en la imagen actual — resuelto en archivo, pendiente de aplicar (Fase ADÁN).
3. **Ollama bind localhost** — ajustar para acceso desde contenedores en el despliegue.
4. **invoices / credit_validations vacías** — se poblarán cuando EVA real persista (Fase 3).
5. **Modelo LLM sin decidir** — gated por el benchmark en curso (no asumir).
