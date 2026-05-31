# PRE-INTEGRATION CHECKLIST

## Oracle

### Interfaces existentes
- Entidad `Client` con información de clientes
- Entidad `Order` con información de pedidos
- Entidad `Invoice` con información de facturación
- Entidad `Product` con información de productos
- Entidad `CreditValidation` con información de validación crediticia

### Adapters existentes
- Módulo `MockModule` con controlador de mocks para datos de clientes y productos
- Servicio de email en `src/modules/quotes/email.service.ts` para notificaciones

### Mocks existentes
- Datos mock en `src/modules/mock/mock.controller.ts` para:
  - Inventario de productos
  - Información de clientes
  - Validación crediticia
  - Creación de órdenes
  - Generación de facturas

### Trabajo faltante
- Implementación real de conexión a Oracle
- Adaptadores para sincronización de datos en tiempo real
- Manejo de autenticación con Oracle
- Procesos de sincronización de catálogos de productos
- Sincronización de estados de órdenes e inventario

## DIAN

### Interfaces existentes
- Entidad `Invoice` con estructura de facturas
- Módulo de generación de PDF en servicios relacionados
- Controlador de mocks con endpoint para generación de facturas

### Adapters existentes
- Servicio de email en `src/modules/quotes/email.service.ts` para envío de facturas
- Mock controller con endpoint específico para creación de facturas

### Mocks existentes
- Datos mock de facturas en `src/modules/mock/mock.controller.ts`
- Simulación de estados de aceptación por la DIAN

### Trabajo faltante
- Implementación real de conexión con la DIAN
- Adaptadores para envío automatizado de facturas
- Validación de formatos requeridos por la DIAN
- Manejo de respuestas y estados de aceptación/rechazo
- Generación de eventos para seguimiento de facturas

## E-Franco

### Interfaces existentes
- Entidad `Shipment` con información de envíos
- Entidad `ShipmentTracking` con seguimiento de envíos
- Entidad `ExportOperation` con operaciones de exportación

### Adapters existentes
- Módulo `MockModule` con datos de seguimiento de envíos
- Controladores REST para gestión de envíos

### Mocks existentes
- Datos mock de envíos en el módulo de mock
- Simulación de estados de envío (en tránsito, entregado, etc.)

### Trabajo faltante
- Implementación real de conexión con E-Franco
- Adaptadores para creación de guías de envío
- Sincronización de estados de envío en tiempo real
- Manejo de confirmaciones de entrega
- Integración con sistemas de tracking de E-Franco

## Cube IQ

### Interfaces existentes
- Entidad `Dashboard` con KPIs de negocio
- Entidad `ProductionOrder` con órdenes de producción
- Entidad `MaterialConsumption` con consumo de materiales
- Entidad `RawMaterialConsumption` con consumo de materia prima
- Entidad `PackagingConsumption` con consumo de empaques

### Adapters existentes
- Servicio `DashboardService` con consultas a múltiples entidades
- Controlador `DashboardController` con endpoints REST

### Mocks existentes
- Datos generados por el seed para todas las entidades de negocio
- KPIs calculados en tiempo real basados en datos mock

### Trabajo faltante
- Implementación real de conexión con Cube IQ
- Adaptadores para envío de datos de KPIs
- Sincronización de métricas en tiempo real
- Formatos específicos requeridos por Cube IQ
- Manejo de errores en la transmisión de datos

## Navieras

### Interfaces existentes
- Entidad `ExportOperation` con operaciones de exportación
- Entidad `FreightQuote` con cotizaciones de fletes
- Entidad `InsuranceQuote` con cotizaciones de seguros
- Entidad `PackingList` con listas de empaque
- Entidad `MasterPackingList` con listas maestras de empaque

### Adapters existentes
- Módulo `MockModule` con datos de operaciones de exportación
- Controladores REST para gestión de exportaciones

### Mocks existentes
- Datos mock de operaciones de exportación
- Simulación de estados de exportación (creado, liquidado, costeado, etc.)

### Trabajo faltante
- Implementación real de conexión con sistemas de navieras
- Adaptadores para creación de bookings
- Sincronización de estados de embarque
- Manejo de documentación requerida por navieras
- Integración con sistemas de tracking marítimo

## WhatsApp

### Interfaces existentes
- Módulo `NotificationModule` con sistema de notificaciones
- Entidad `Notification` con estructura de notificaciones
- Servicio `NotificationService` con lógica de envío

### Adapters existentes
- Sistema de notificaciones basado en eventos
- Controlador de mocks con endpoints de notificación

### Mocks existentes
- Simulación de envío de notificaciones
- Datos de notificaciones en el seed

### Trabajo faltante
- Implementación real de conexión con API de WhatsApp
- Adaptadores para envío de mensajes automatizados
- Manejo de plantillas de mensajes
- Sincronización de estados de entrega
- Integración con sistema de notificaciones existente

## Email

### Interfaces existentes
- Servicio `EmailService` en `src/modules/quotes/email.service.ts`
- Controlador de mocks con endpoints de email
- Sistema de notificaciones con soporte para email

### Adapters existentes
- Adaptador de email en módulo de quotes
- Mock controller con endpoints de email

### Mocks existentes
- Simulación de envío de emails en el módulo de mock
- Datos de prueba para emails de cotización y facturas

### Trabajo faltante
- Implementación real de servicio de email
- Configuración de servidor SMTP
- Plantillas de emails para diferentes tipos de notificaciones
- Manejo de errores en envío de emails
- Seguimiento de entregas y aperturas