# GIT ISOLATION REPORT

## Archivos que pertenecen a Oben

### KEEP
- `backend/` - Directorio completo del backend NestJS
- `frontend/` - Directorio completo del frontend Next.js
- `docker/` - Configuración de Docker Compose
- `docs/` - Documentación técnica del proyecto
- `Business/` - Documentos de negocio
- `Software/` - Documentación técnica de software
- `README.md` - Documento principal del proyecto
- `README-RUN.md` - Instrucciones de ejecución
- `package.json` - Configuración de paquetes Node.js
- `.gitignore` - Archivos ignorados por Git

### REMOVE
- `$null` - Archivo nulo creado por error
- `node_modules/` - Dependencias de Node.js (reinstalables)
- `package-lock.json` - Bloqueo de versiones de dependencias
- `backend/node_modules/` - Dependencias de Node.js del backend
- `backend/package-lock.json` - Bloqueo de versiones del backend
- `frontend/node_modules/` - Dependencias de Node.js del frontend
- `frontend/package-lock.json` - Bloqueo de versiones del frontend
- `backend/dist/` - Archivos compilados (regenerables)
- `frontend/.next/` - Archivos de compilación de Next.js (regenerables)
- `backend-new/` - Directorio de backend alternativo
- `frontend-new/` - Directorio de frontend alternativo
- `dta-oben-group/` - Directorio duplicado
- `agents/` - Directorio de agentes
- `config/` - Directorio de configuración
- `configs/` - Directorio de configuraciones
- `create_compressed_folders.py` - Script de compresión
- `infrastructure/` - Directorio de infraestructura
- `memory/` - Directorio de memoria
- `projects/` - Directorio de proyectos
- `prompts/` - Directorio de prompts
- `scripts/` - Directorio de scripts
- `shared/` - Directorio compartido
- `tests/` - Directorio de pruebas
- `.claude/` - Configuración de Claude
- `.eden/` - Configuración de Eden

### MOVE
- `backend/setup-db.js` - Script de configuración de base de datos (mover a tools/)
- `backend/test-db.js` - Script de prueba de base de datos (mover a tools/)

## Scripts de debugging

### KEEP
- `backend/setup-db.js` - Script para configuración de base de datos
- `backend/test-db.js` - Script para prueba de conexión a base de datos

### REMOVE
- Todos los archivos de cache y compilación temporales

## Dependencias externas

### KEEP
- `backend/package.json` - Declaración de dependencias del backend
- `frontend/package.json` - Declaración de dependencias del frontend
- `docker/docker-compose.yml` - Declaración de servicios Docker

### REMOVE
- `node_modules/` en todos los niveles (reinstalables)
- `package-lock.json` en todos los niveles (regenerables)

## Riesgos

### Riesgos identificados
1. **Dependencias externas**: El proyecto depende de npm registry para instalar dependencias
2. **Configuración de ambiente**: Requiere Docker y Node.js instalados
3. **Datos de prueba**: Los datos de seed son mocks que deben ser reemplazados por datos reales
4. **Variables de entorno**: Algunas variables están hardcodeadas en lugar de usar .env
5. **Conexiones externas**: El proyecto tiene conexiones mockeadas a sistemas externos que deben ser implementadas

### Archivos temporales a eliminar
- Todos los archivos en `node_modules/`
- Todos los archivos en `backend/dist/`
- Todos los archivos en `frontend/.next/`
- Archivos de cache del sistema operativo
- Archivos temporales de compilación
- Archivos de logs temporales

## Clasificación final de archivos

### Archivos de código fuente (KEEP)
- Todos los archivos `.ts` y `.tsx` en `backend/src/` y `frontend/src/`
- Todos los archivos de configuración de entidades
- Todos los archivos de servicios y controladores
- Todos los archivos de módulos NestJS
- Todos los archivos de componentes Next.js

### Archivos de documentación (KEEP)
- `README.md`
- `README-RUN.md`
- Todos los archivos en `docs/`
- Todos los archivos en `Business/`
- Todos los archivos en `Software/`

### Archivos de infraestructura (KEEP)
- `docker/docker-compose.yml`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `.gitignore`

### Archivos de configuración (KEEP)
- `backend/.env`
- `backend/nest-cli.json`
- `backend/tsconfig.json`
- `backend/tsconfig.build.json`
- `frontend/next.config.mjs`
- `frontend/tsconfig.json`

### Archivos temporales (REMOVE)
- Todos los archivos en `node_modules/`
- Todos los archivos en `backend/dist/`
- Todos los archivos en `frontend/.next/`
- Archivos de cache del sistema
- Archivos temporales de compilación