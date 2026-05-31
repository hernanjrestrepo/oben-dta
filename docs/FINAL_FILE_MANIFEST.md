# FINAL FILE MANIFEST

## Archivos Creados

### Backend
- `backend/setup-db.js` - Script para configuración de base de datos
- `backend/test-db.js` - Script para prueba de conexión a base de datos
- `backend/src/modules/mock/` - Directorio con módulo de mocks
  - `backend/src/modules/mock/mock.controller.ts` - Controlador de mocks
  - `backend/src/modules/mock/mock.module.ts` - Módulo de mocks
- `backend/src/modules/seed/seed.module.ts` - Módulo de seed
- `backend/src/modules/seed/seed.service.ts` - Servicio de seed con datos de prueba

### Documentación
- `docs/dashboard-root-cause-analysis.md` - Análisis de causa raíz del problema del dashboard
- `docs/RUNTIME_READY_REPORT.md` - Reporte de estado del sistema
- `docs/REPOSITORY_READINESS.md` - Reporte de preparación del repositorio
- `docs/PRE_INTEGRATION_CHECKLIST.md` - Checklist de pre-integración
- `docs/MONDAY_INTEGRATION_PLAN.md` - Plan de integración para el lunes

## Archivos Modificados

### Backend
- `backend/src/services/dashboard.service.ts` - Correcciones en consultas y columnas de base de datos
- `backend/src/modules/dashboard.module.ts` - Agregada configuración de JwtModule
- `backend/src/controllers/dashboard.controller.ts` - Uso de TestGuard para pruebas
- `backend/src/modules/auth/auth.module.ts` - Configuración de secretos JWT

### Configuración
- `README.md` - Actualizada con descripción del proyecto
- `README-RUN.md` - Actualizada con instrucciones de ejecución

## Archivos Eliminados

### Temporales
- Archivos de compilación en `backend/dist/` (regenerados)
- Archivos de node_modules temporales (reinstalables)
- Archivos de cache de frontend en `frontend/.next/`

## Archivos Externos

### Dependencias
- `backend/node_modules/` - Dependencias de Node.js (no versionadas)
- `frontend/node_modules/` - Dependencias de Node.js (no versionadas)
- `package-lock.json` - Bloqueo de versiones de dependencias

### Configuración de IDE
- `.vscode/` - Configuración específica de Visual Studio Code
- `.gitignore` - Archivos ignorados por Git

## Archivos de Infraestructura

### Docker
- `docker/docker-compose.yml` - Configuración de contenedores
- `backend/Dockerfile` - Configuración de contenedor backend
- `frontend/Dockerfile` - Configuración de contenedor frontend

## Archivos de Entidades de Negocio

### Entidades Principales
- `backend/src/entities/client.entity.ts` - Entidad de clientes
- `backend/src/entities/order.entity.ts` - Entidad de órdenes
- `backend/src/entities/invoice.entity.ts` - Entidad de facturas
- `backend/src/entities/product.entity.ts` - Entidad de productos
- `backend/src/entities/user.entity.ts` - Entidad de usuarios
- `backend/src/entities/production-order.entity.ts` - Entidad de órdenes de producción
- `backend/src/entities/export-operation.entity.ts` - Entidad de operaciones de exportación
- `backend/src/entities/shipment.entity.ts` - Entidad de envíos
- `backend/src/entities/freight-quote.entity.ts` - Entidad de cotizaciones de fletes
- `backend/src/entities/insurance-quote.entity.ts` - Entidad de cotizaciones de seguros
- `backend/src/entities/packing-list.entity.ts` - Entidad de listas de empaque
- `backend/src/entities/master-packing-list.entity.ts` - Entidad de listas maestras de empaque

### Entidades Auxiliares
- `backend/src/entities/audit-event.entity.ts` - Entidad de eventos de auditoría
- `backend/src/entities/credit-validation.entity.ts` - Entidad de validación crediticia
- `backend/src/entities/incoterm.entity.ts` - Entidad de términos internacionales de comercio
- `backend/src/entities/material-consumption.entity.ts` - Entidad de consumo de materiales
- `backend/src/entities/notification.entity.ts` - Entidad de notificaciones
- `backend/src/entities/order-item.entity.ts` - Entidad de items de órdenes
- `backend/src/entities/packaging-consumption.entity.ts` - Entidad de consumo de empaques
- `backend/src/entities/quote.entity.ts` - Entidad de cotizaciones
- `backend/src/entities/quote-item.entity.ts` - Entidad de items de cotizaciones
- `backend/src/entities/raw-material-consumption.entity.ts` - Entidad de consumo de materia prima
- `backend/src/entities/shipment-tracking.entity.ts` - Entidad de seguimiento de envíos
- `backend/src/entities/workflow-event.entity.ts` - Entidad de eventos de workflow

## Archivos de Servicios

### Servicios Principales
- `backend/src/services/dashboard.service.ts` - Servicio de dashboard
- `backend/src/services/notification.service.ts` - Servicio de notificaciones
- `backend/src/services/workflow-engine.service.ts` - Servicio de motor de workflow
- `backend/src/services/ai.service.ts` - Servicio de inteligencia artificial
- `backend/src/modules/quotes/email.service.ts` - Servicio de email

## Archivos de Módulos

### Módulos Principales
- `backend/src/modules/app.module.ts` - Módulo principal de la aplicación
- `backend/src/modules/auth/auth.module.ts` - Módulo de autenticación
- `backend/src/modules/dashboard.module.ts` - Módulo de dashboard
- `backend/src/modules/notification.module.ts` - Módulo de notificaciones
- `backend/src/modules/workflow.module.ts` - Módulo de workflow
- `backend/src/modules/ai.module.ts` - Módulo de inteligencia artificial
- `backend/src/modules/mock/mock.module.ts` - Módulo de mocks
- `backend/src/modules/seed/seed.module.ts` - Módulo de seed

## Archivos de Controladores

### Controladores Principales
- `backend/src/controllers/dashboard.controller.ts` - Controlador de dashboard
- `backend/src/controllers/notification.controller.ts` - Controlador de notificaciones
- `backend/src/controllers/test.controller.ts` - Controlador de pruebas
- `backend/src/controllers/ai.controller.ts` - Controlador de inteligencia artificial
- `backend/src/modules/mock/mock.controller.ts` - Controlador de mocks

## Archivos de Documentación Técnica

### Documentos Técnicos
- `Business/` - Documentos de negocio
- `Software/` - Documentación técnica de software
- `README.md` - Documento principal del proyecto
- `README-RUN.md` - Instrucciones de ejecución
- `docs/` - Directorio de documentación técnica

## Archivos de Configuración

### Configuración del Proyecto
- `backend/.env` - Variables de entorno
- `backend/nest-cli.json` - Configuración de NestJS CLI
- `backend/tsconfig.json` - Configuración de TypeScript
- `backend/tsconfig.build.json` - Configuración de compilación de TypeScript
- `frontend/next.config.mjs` - Configuración de Next.js
- `frontend/tsconfig.json` - Configuración de TypeScript
- `package.json` - Configuración de paquetes Node.js