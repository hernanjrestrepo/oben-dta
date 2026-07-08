# Manual de Operación — DTA Oben

> Servidor `10.50.30.10` · ruta del proyecto: `~/dta/docker`.
> Stack: Docker Compose (postgres+pgvector, redis, backend, frontend) + Ollama (systemd).

## Variables de compose
Todas las operaciones usan los dos archivos de compose:
```bash
cd ~/dta/docker
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.pgvector.yml"
```

## Iniciar
```bash
$COMPOSE up -d
sudo systemctl start ollama   # si no está activo
```

## Detener
```bash
$COMPOSE stop          # detiene sin borrar
# o bajar del todo (conserva volúmenes/datos):
$COMPOSE down
```

## Reiniciar
```bash
$COMPOSE restart backend         # un servicio
$COMPOSE restart                 # todos
sudo systemctl restart ollama    # motor IA
```

## Actualizar (nuevo código)
```bash
# 1. respaldar (ver PLAN_BACKUP.md)
# 2. traer el código nuevo a ~/dta
# 3. reconstruir e implementar
$COMPOSE up -d --build backend          # o frontend
# 4. aplicar migraciones nuevas si las hay
cat ~/dta/backend/migrations/<nueva>.sql | docker exec -i dta-postgres psql -U dta -d dta_db
```

## Configurar integraciones (cuando lleguen credenciales de Oben)
```bash
# editar ~/dta/docker/.env y agregar las variables (ver REQUERIMIENTOS_OBEN.md)
nano ~/dta/docker/.env
$COMPOSE up -d backend            # recargar con las nuevas variables
curl -s http://localhost:3004/integrations/status   # verificar configured:true
```
**Solo eso:** configurar variables → reiniciar backend → validar. Sin tocar código.

## Verificar salud
```bash
curl -s http://localhost:3004/health           # {"status":"ok","db":"ok"}
$COMPOSE ps                                     # estados healthy
docker exec dta-backend curl -s http://host.docker.internal:11434/api/tags  # Ollama
```

## Logs
```bash
$COMPOSE logs -f backend
$COMPOSE logs --tail=100 frontend
sudo journalctl -u ollama -f
```

## Respaldar / Restaurar
Ver `PLAN_BACKUP.md` (procedimientos validados).

## Acceso de usuarios
- Admin: `admin.demo@oben.com` / `DtaAdmin2026!`
- Crear usuarios vía `POST /auth/register` (rol `sales` por defecto; promoción a otros
  roles solo por un admin / actualización en DB — el register NO permite elegir rol).
