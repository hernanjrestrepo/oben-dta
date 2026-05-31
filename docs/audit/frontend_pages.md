# Inventario Completo de Páginas Frontend

## Páginas en frontend/src/app/

### Página Principal
- **Archivo**: `frontend/src/app/page.tsx`
- **Descripción**: Dashboard principal del sistema con visualización de cotizaciones y flujo automatizado
- **Componentes principales**:
  - Visualización de cotizaciones con estado en tiempo real
  - Timeline visual del flujo de procesos
  - Simulación de pagos
  - Visualización de PDFs de cotizaciones
  - Log de actividad de la IA

## Páginas en dta-oben-group/frontend/src/app/

### Página Principal (Landing)
- **Archivo**: `dta-oben-group/frontend/src/app/page.tsx`
- **Descripción**: Página de inicio con presentación de la plataforma DTA
- **Componentes principales**:
  - Hero section con animaciones
  - Navegación a dashboard y portal
  - Grid de características (IA, Compliance, Exportación, Analytics)
  - Enlaces de acceso rápido

### Portal de Clientes
- **Archivo**: `dta-oben-group/frontend/src/app/portal/page.tsx`
- **Descripción**: Portal dedicado para clientes con información de pedidos y cotizaciones
- **Componentes principales**:
  - Información de la empresa cliente
  - Estadísticas rápidas (pedidos activos, cotizaciones, entregas)
  - Lista de pedidos recientes con estados
  - Cotizaciones pendientes con acciones

## Componentes en dta-oben-group/frontend/src/components/

### Dashboard Layout
- **Archivo**: `dta-oben-group/frontend/src/components/dashboard/DashboardLayout.tsx`
- **Descripción**: Layout principal del dashboard con sidebar y navegación
- **Componentes principales**:
  - Sidebar colapsable con menú de navegación
  - Header con barra de búsqueda y notificaciones
  - Sistema de rutas para diferentes secciones del dashboard

### Componentes del Dashboard
- **BillingOverview.tsx**: Vista general de facturación
- **KpiCards.tsx**: Tarjetas de indicadores clave de rendimiento
- **LogisticsTracker.tsx**: Seguimiento de logística
- **OrderFlow.tsx**: Visualización del flujo de órdenes
- **ProductionStatus.tsx**: Estado de producción

## Páginas en Software/dta/frontend/src/app/

### Página Principal (Demo)
- **Archivo**: `Software/dta/frontend/src/app/page.tsx`
- **Descripción**: Página de demostración básica del flujo de pedidos
- **Componentes principales**:
  - Input para ingresar pedidos en texto natural
  - Visualización de resultados de procesamiento
  - Tres escenarios de demostración (confirmado, producción, bloqueado)
  - Validaciones de cartera e inventario