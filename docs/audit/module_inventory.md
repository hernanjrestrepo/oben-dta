# Inventario Completo de Módulos

## Módulos en Software/dta/backend

### Módulo Flow
- **Ubicación**: `Software/dta/backend/src/modules/flow/`
- **Descripción**: Módulo principal que procesa órdenes con validaciones mock
- **Componentes**:
  - `flow.controller.ts`: Controlador con endpoint POST /flow/process
  - `flow.service.ts`: Servicio que implementa la lógica de procesamiento de órdenes

### Módulo Mock
- **Ubicación**: `Software/dta/backend/src/modules/mock/`
- **Descripción**: Módulo con APIs mock para simular servicios externos
- **Componentes**:
  - `mock.controller.ts`: Controlador con endpoints para inventory, products, credit, orders, invoice

## Módulos en backend/

### Módulo Auth
- **Ubicación**: `backend/src/modules/auth/`
- **Descripción**: Módulo de autenticación y autorización
- **Componentes**:
  - Controladores, servicios y DTOs para autenticación

### Módulo Clients
- **Ubicación**: `backend/src/modules/clients/`
- **Descripción**: Gestión de clientes y parametrización
- **Componentes**:
  - DTOs para clientes

### Módulo Flow
- **Ubicación**: `backend/src/modules/flow/`
- **Descripción**: Procesamiento de flujos de negocio

### Módulo IA
- **Ubicación**: `backend/src/modules/ia/`
- **Descripción**: Integración con inteligencia artificial

### Módulo Invoices
- **Ubicación**: `backend/src/modules/invoices/`
- **Descripción**: Gestión de facturación

### Módulo Mock
- **Ubicación**: `backend/src/modules/mock/`
- **Descripción**: APIs mock para simulación

### Módulo Orders
- **Ubicación**: `backend/src/modules/orders/`
- **Descripción**: Gestión de órdenes de pedido
- **Componentes**:
  - DTOs para órdenes

### Módulo Products
- **Ubicación**: `backend/src/modules/products/`
- **Descripción**: Gestión de productos e inventario
- **Componentes**:
  - DTOs para productos

### Módulo Quotes
- **Ubicación**: `backend/src/modules/quotes/`
- **Descripción**: Gestión de cotizaciones

## Módulos en dta-oben-group/backend

### Módulo AI Engine
- **Ubicación**: `dta-oben-group/backend/src/modules/ai-engine/`
- **Descripción**: Motor de inteligencia artificial

### Módulo Billing
- **Ubicación**: `dta-oben-group/backend/src/modules/billing/`
- **Descripción**: Módulo de facturación

### Módulo Clients
- **Ubicación**: `dta-oben-group/backend/src/modules/clients/`
- **Descripción**: Gestión de clientes

### Módulo Inventory
- **Ubicación**: `dta-oben-group/backend/src/modules/inventory/`
- **Descripción**: Gestión de inventario

### Módulo Mock APIs
- **Ubicación**: `dta-oben-group/backend/src/modules/mock-apis/`
- **Descripción**: APIs mock para simulación

### Módulo Orders
- **Ubicación**: `dta-oben-group/backend/src/modules/orders/`
- **Descripción**: Gestión de órdenes

### Módulo Production
- **Ubicación**: `dta-oben-group/backend/src/modules/production/`
- **Descripción**: Gestión de producción

### Módulo Workflow
- **Ubicación**: `dta-oben-group/backend/src/modules/workflow/`
- **Descripción**: Gestión de flujos de trabajo