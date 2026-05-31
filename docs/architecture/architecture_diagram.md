# Diagrama de Arquitectura

## Arquitectura General del Sistema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTE WEB                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────────────────────────────┐  │
│  │   Portal Clientes   │  │        Dashboard Empresarial                │  │
│  │  (dta-oben-group)   │  │        (dta-oben-group)                     │  │
│  └─────────────────────┘  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY (NestJS)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────────────────────────────┐  │
│  │   Autenticación     │  │        Gestión de Entidades                 │  │
│  │   (Auth Module)     │  │  (Clients, Orders, Products, Quotes)        │  │
│  ├─────────────────────┤  ├─────────────────────────────────────────────┤  │
│  │   Procesamiento     │  │        Flujo Comercial                  │  │
│  │   de IA             │  │  (Flow Module, Quotes Controller)           │  │
│  │   (IA Module)       │  │                                             │  │
│  ├─────────────────────┤  ├─────────────────────────────────────────────┤  │
│  │   Simulaciones      │  │        APIs Externas                        │  │
│  │   (Mock Module)     │  │  (Oracle, Oben+, DIAN, Navieras, Cube IQ)   │  │
│  └─────────────────────┘  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVICIOS EXTERNOS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │      Oracle         │  │      Oben+          │  │      DIAN           │ │
│  ├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤ │
│  │   Navieras          │  │   Cube IQ           │  │   EFranco           │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INFRAESTRUCTURA                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │   PostgreSQL        │  │      Redis          │  │   Docker            │ │
│  │   (TypeORM)         │  │   (Caché, Colas)    │  │   (Contenedores)    │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Componentes Principales

### 1. Capa de Presentación
- **Portal Clientes**: Interfaz dedicada para clientes con acceso a pedidos, cotizaciones y estado de cuentas
- **Dashboard Empresarial**: Interfaz interna para empleados con acceso completo al sistema

### 2. Capa de API (NestJS)
- **Módulo de Autenticación**: Gestión de usuarios, login, JWT tokens
- **Módulo de Clientes**: CRUD de clientes y parametrización
- **Módulo de Productos**: Gestión de catálogo e inventario
- **Módulo de Órdenes**: Procesamiento de pedidos con estados
- **Módulo de Cotizaciones**: Flujo completo de cotización por email
- **Módulo de Facturación**: Generación y gestión de facturas
- **Módulo de IA**: Procesamiento inteligente de solicitudes
- **Módulo de Simulaciones**: APIs mock para desarrollo y testing

### 3. Capa de Datos
- **PostgreSQL**: Base de datos principal con TypeORM
- **Redis**: Caché y colas de mensajes

### 4. Integraciones Externas
- **Oracle**: Sistema ERP existente
- **Oben+**: Sistema de gestión empresarial
- **DIAN**: Facturación electrónica
- **Navieras**: Cotización y seguimiento logístico
- **Cube IQ**: Cálculo de cubicaje y balanceo

## Flujo de Datos

1. **Solicitud de Cliente**: Email/WhatsApp → Portal Clientes
2. **Procesamiento IA**: Parser de solicitud → Cotización automática
3. **Validación Interna**: Cartera → Inventario → Aprobación
4. **Generación de Documentos**: Cotización PDF → Orden → Factura
5. **Integración con Sistemas**: Oracle (inventario) → Oben+ (procesos) → DIAN (facturación)
6. **Logística**: Cube IQ (cubicaje) → Navieras (envío) → Tracking

## Patrones Arquitectónicos

- **Microservicios**: Módulos independientes con responsabilidades únicas
- **API First**: Todas las funcionalidades expuestas como APIs REST
- **CQRS**: Separación de comandos y consultas
- **Event-Driven**: Uso de colas para procesos asíncronos
- **Caché**: Redis para mejorar el rendimiento