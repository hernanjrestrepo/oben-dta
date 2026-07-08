# Checklist Go-Live — DTA Oben

> Estado real al 2026-06-23, servidor `10.50.30.10`. Cada ítem refleja evidencia ejecutada, no
> intención. Fuente: `REPORTE_CIERRE_PREINTEGRACIONES.md`, `DESPLIEGUE_DEFINITIVO.md`,
> `EJECUCION_PRUEBAS.md`, `PLAN_BACKUP.md`.

## Infraestructura
- [x] Servidor provisto por Oben, accesible por VPN FortiClient + SSH.
- [x] Docker + Docker Compose instalados.
- [x] Ollama nativo (systemd) corriendo, `OLLAMA_HOST=0.0.0.0`, alcanzable desde Docker vía `host.docker.internal`.
- [x] PostgreSQL con extensión `pgvector` (imagen `pgvector/pgvector:pg16`).
- [x] 4 contenedores (postgres, redis, backend, frontend) en estado `healthy`.
- [ ] **URL pública / DNS / reverse proxy / SSL** — bloqueado por firewall corporativo de Oben (solo SSH/22 pasa). Requiere acción de IT (ver `DESPLIEGUE_DEFINITIVO.md`, opciones A/B).

## Aplicación
- [x] Login operativo con usuario demo real (`admin.demo@oben.com`).
- [x] `/health` responde `{"status":"ok","db":"ok"}`.
- [x] EVA (`/eva/process`): tool calling real con qwen2.5:3b, persistencia verificada en PostgreSQL (orders/invoices reales, no ficticios).
- [x] ADÁN (`/adan/ask`): RAG con pgvector, respuestas con fuentes citadas, ingestión multi-formato (PDF/DOCX/XLSX/TXT/MD) validada.
- [x] Centro de Operaciones IA: KPIs en vivo desde datos reales.
- [x] Integration Hub desplegado, responde `pendiente_credenciales` de forma honesta (no inventa datos) mientras no haya credenciales.

## Seguridad
- [x] JWT con `JWT_SECRET` propio del ambiente (no compartido).
- [x] RBAC por rol validado (Sprint Seguridad 0).
- [x] Anti-escalada de privilegios validada (IDOR/admin escalation cerrados).
- [x] `/auth/refresh` corregido (acepta `refreshToken` y `refresh_token`).
- [ ] HTTPS — depende de la apertura de red de Oben (mismo bloqueo de URL pública).
- [ ] Eliminar clave SSH en texto plano de `run-audit.sh` (herramienta local del operador, fuera del repo) — pendiente confirmación del usuario.

## Datos y backups
- [x] Backup (`pg_dump`) generado y restaurado en base temporal — conteos de filas/embeddings coinciden.
- [ ] Cron de backup diario automatizado en el servidor — documentado en `PLAN_BACKUP.md`, pendiente de activar.

## Documentación
- [x] `MANUAL_OPERACION.md`, `PLAN_DE_PRUEBAS.md`, `EJECUCION_PRUEBAS.md`, `AUDITORIA_FINAL_DTA.md`, `PLAN_BACKUP.md`, `MATRIZ-INTEGRACIONES.md`, `REQUERIMIENTOS_OBEN.md`, `DESPLIEGUE_DEFINITIVO.md`, `REPORTE_CIERRE_PREINTEGRACIONES.md`, `INVENTARIO_ENDPOINTS.md`, `INVENTARIO_VARIABLES_ENV.md`.
- [ ] `MANUAL_ADMINISTRADOR.md`, `MANUAL_TECNICO.md`, `MANUAL_INTEGRACIONES.md`, `BASE_CONOCIMIENTO_OBEN.md` (en curso, esta misión).

## Bloqueos externos (no son código, requieren a Oben)
1. **Acceso público**: IT de Oben debe abrir 3000/3004 o publicar vía reverse proxy + dominio + SSL.
2. **Credenciales de integración**: VETA, NetSuite, Armstrong — ver `REQUERIMIENTOS_OBEN.md`.

## Veredicto
DTA está **listo para producción a nivel de plataforma y código**. El Go-Live completo (acceso
desde cualquier ubicación, integraciones activas) depende de dos decisiones externas de Oben, no
de trabajo de desarrollo pendiente.
