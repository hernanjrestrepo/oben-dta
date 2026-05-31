# Lista de Mocks Identificados

## Mocks en Backend

### Mock Controller
- **Ubicación**: `backend/src/modules/mock/mock.controller.ts`
- **Propósito**: Simular servicios externos para desarrollo y testing
- **Endpoints Mockeados**:
  - `GET /mock/inventory` - Simula inventario de productos
  - `GET /mock/products/:sku` - Simula consulta de producto por SKU
  - `GET /mock/credit/:clientId` - Simula consulta de información crediticia
  - `POST /mock/orders` - Simula creación de órdenes
  - `POST /mock/invoice` - Simula generación de facturas
- **Datos Mockeados**:
  - Productos: Tornillos, Tuercas con precios y stock
  - Clientes: Industrias del Norte S.A.S. con límites de crédito
- **Estado**: Implementado y funcional

### Flow Service Mock
- **Ubicación**: `Software/dta/backend/src/modules/flow/flow.service.ts`
- **Propósito**: Simular flujo de procesamiento de órdenes
- **Datos Mockeados**:
  - Productos con stock y precios
  - Clientes con límites de crédito
- **Funcionalidades Mockeadas**:
  - Interpretación básica de texto
  - Validación de crédito
  - Validación de inventario
  - Generación de órdenes y facturas
- **Estado**: Implementado y funcional

### Quotes Service (Parcialmente Mock)
- **Ubicación**: `backend/src/modules/quotes/quotes.service.ts`
- **Propósito**: Procesar emails de cotización con IA
- **Funcionalidades Mockeadas**:
  - Parseo de emails (simulado)
  - Generación de PDFs (simulado)
  - Aprobación de cotizaciones (simulado)
  - Links de pago (simulados)
- **Estado**: Parcialmente implementado

## Mocks en Frontend

### Datos Mockeados en Página Principal
- **Ubicación**: `frontend/src/app/page.tsx`
- **Datos Mockeados**:
  - Estados de cotización: RECEIVED, PARSING, QUOTED, etc.
  - Cotizaciones de ejemplo con IDs y montos
  - Clientes de prueba
  - Items de cotización simulados
- **Funcionalidades Mockeadas**:
  - Simulación de pago de cliente
  - Visualización de PDFs (sin generación real)
- **Estado**: Implementado para demo

### Portal de Clientes Mock
- **Ubicación**: `dta-oben-group/frontend/src/app/portal/page.tsx`
- **Datos Mockeados**:
  - Información de empresa cliente (Alpina)
  - Pedidos recientes
  - Cotizaciones pendientes
  - Estadísticas de uso
- **Estado**: Implementado para demo

## Mocks en Entidades de Base de Datos

### Datos de Prueba en Entidades
- **Ubicación**: Varios archivos en `backend/src/entities/`
- **Datos Mockeados**:
  - Clientes con datos de ejemplo
  - Productos con descripciones y precios ficticios
  - Órdenes con estados simulados
  - Cotizaciones con montos de prueba
- **Estado**: Definidos en estructura pero sin datos reales

## Mocks de Integraciones Externas

### Oracle (Simulado)
- **Estado**: No implementado, solo planificado
- **Propósito**: Simular integración con sistema ERP

### Oben+ (Simulado)
- **Estado**: No implementado, solo planificado
- **Propósito**: Simular integración con sistema de gestión

### DIAN (Simulado)
- **Estado**: No implementado, solo planificado
- **Propósito**: Simular facturación electrónica

### Navieras (Simulado)
- **Estado**: No implementado, solo planificado
- **Propósito**: Simular cotización y seguimiento logístico

### Cube IQ (Simulado)
- **Estado**: No implementado, solo planificado
- **Propósito**: Simular cálculo de cubicaje y balanceo

## Mocks de Inteligencia Artificial

### IA Parser (Simulado)
- **Ubicación**: `backend/src/modules/quotes/quotes.service.ts`
- **Propósito**: Simular procesamiento de emails con IA
- **Funcionalidad**: Parseo básico de texto sin IA real
- **Estado**: Mock funcional pero sin IA real

### Generación de Contenido (Simulado)
- **Estado**: No implementado
- **Propósito**: Simular generación automática de documentos

## Mocks de Autenticación

### Usuarios de Prueba
- **Ubicación**: `backend/src/entities/user.entity.ts`
- **Datos Mockeados**:
  - Roles de usuario (ADMIN, SALES, PRODUCTION, FINANCE)
  - Cuentas de prueba sin implementación real
- **Estado**: Estructura definida pero sin datos reales

## Mocks de Comunicación

### Email (Simulado)
- **Estado**: Parcialmente implementado
- **Propósito**: Simular recepción y envío de emails
- **Funcionalidad**: Solo estructura, sin conexión real

### WhatsApp (Simulado)
- **Estado**: No implementado
- **Propósito**: Simular comunicación por WhatsApp
- **Funcionalidad**: Solo planificada

## Mocks de Pago

### Pasarelas de Pago (Simuladas)
- **Estado**: Parcialmente implementado
- **Propósito**: Simular procesamiento de pagos
- **Funcionalidad**: Generación de links falsos y simulación de pagos

## Nivel de Complejidad de Mocks

### Bajo (Simple)
- Mock Controller (datos estáticos)
- Flow Service (lógica básica)
- Portal de Clientes (datos fijos)

### Medio (Intermedio)
- Quotes Service (procesamiento simulado)
- Frontend Dashboard (componentes con datos mock)
- Entidades con datos de ejemplo

### Alto (Complejo)
- Integraciones externas (solo planificadas)
- IA (simulación sin implementación real)
- Sistema de autenticación (estructura sin datos reales)

## Recomendaciones para Evolución de Mocks

### Prioridad Alta
1. Reemplazar Mock Controller con integraciones reales
2. Implementar IA real en Quotes Service
3. Conectar con sistemas externos reales

### Prioridad Media
1. Completar integraciones planificadas
2. Implementar autenticación real
3. Conectar pasarelas de pago reales

### Prioridad Baja
1. Mejorar mocks de frontend para mayor realismo
2. Agregar más datos de prueba realistas
3. Implementar mocks más sofisticados para testing

## Impacto de los Mocks Actuales

### Ventajas
- Permite desarrollo y testing sin sistemas externos
- Facilita demostraciones y presentaciones
- Reduce dependencias durante el desarrollo inicial
- Permite identificar flujos de negocio

### Desventajas
- No refleja la complejidad real de integraciones
- Puede generar expectativas erróneas sobre funcionalidades
- Requiere reescritura cuando se implementen sistemas reales
- Limita pruebas con datos reales y escenarios complejos