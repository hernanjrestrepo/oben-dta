# Oben Xmart / Oben Plus — notas de infraestructura

## Producción real vs. stack local (IMPORTANTE)

El `docker/docker-compose.yml` de este repo también se puede levantar
**localmente** (en el laptop de desarrollo) — pero eso **NO es producción**.
El 2026-09-12 se confirmó que el stack local había quedado desconectado desde
finales de agosto (sin `obenCostOrder` real configurado, sin actividad en
`workflow_events` desde el 26 de agosto) mientras el sistema real seguía
funcionando en el servidor remoto, causando confusión sobre qué build estaba
realmente atendiendo a Oben. El stack local se detuvo (`docker compose down`,
sin borrar volúmenes) para que no se repita esa confusión.

**Producción real:**
- Servidor: `10.50.30.10` (usuario `paradixexyz`), alcanzable solo con la VPN
  de FortiClient conectada (revisar `Get-NetIPConfiguration` — el adapter
  Fortinet debe tener una IP real tipo `10.250.250.x`, no `169.254.x.x`).
- Código fuente en `/home/paradixexyz/dta/` — **no es un repo git**. El
  despliegue es por tarball, no por `git pull`:
  ```bash
  # en el laptop, desde la raíz del repo:
  tar -czf /tmp/oben-deploy.tar.gz \
    --exclude='backend/node_modules' --exclude='backend/dist' \
    backend/src backend/migrations backend/package.json backend/package-lock.json \
    backend/Dockerfile backend/tsconfig.json backend/tsconfig.build.json \
    backend/nest-cli.json backend/eslint.config.mjs
  scp /tmp/oben-deploy.tar.gz paradixexyz@10.50.30.10:/tmp/oben-deploy.tar.gz
  ssh paradixexyz@10.50.30.10 "cd /home/paradixexyz/dta && tar -xzf /tmp/oben-deploy.tar.gz"
  ssh paradixexyz@10.50.30.10 "cd /home/paradixexyz/dta/docker && docker compose build backend && docker compose up -d backend"
  ```
- Backup antes de sobrescribir: `/home/paradixexyz/dta-backups/` en el remoto.
- Tenant real (Oben Group) en la BD: `92384346-002b-45c4-a4bc-924879374b09`.
- Secretos (`docker/.env` en el remoto) — nunca en git, nunca preguntarlos por
  chat; ya están configurados ahí (`obenCostOrder` en modo `real` con
  `baseUrl`/`authToken` de `api.obengroup.co`, `email` con IMAP/SMTP reales).

**Antes de dar por "desplegado" cualquier fix**, verificar que se construyó y
reinició el `dta-backend` en `10.50.30.10` (vía SSH), no solo en un stack
local — `docker ps` local mostrando contenedores `dta-*` corriendo NO es
evidencia de producción; confirmar con `ssh paradixexyz@10.50.30.10 "docker ps"`.
