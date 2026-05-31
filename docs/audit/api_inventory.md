# Inventario Completo de APIs

## APIs en backend/

### Auth Controller
- **Ruta**: `/auth`
- **Métodos**:
  - `POST /auth/register` - Registrar nuevo usuario
  - `POST /auth/login` - Iniciar sesión de usuario

### Clients Controller
- **Ruta**: `/clients`
- **Métodos**:
  - `POST /clients` - Crear nuevo cliente
  - `GET /clients` - Obtener todos los clientes
  - `GET /clients/:id` - Obtener cliente por ID
  - `PUT /clients/:id` - Actualizar cliente por ID
  - `DELETE /clients/:id` - Eliminar cliente por ID

### Flow Controller
- **Ruta**: `/flow`
- **Métodos**:
  - `POST /flow/process` - Procesar orden con validaciones mock

### Mock Controller
- **Ruta**: `/mock`
- **Métodos**:
  - `GET /mock/inventory` - Obtener inventario mock
  - `GET /mock/products/:sku` - Obtener producto por SKU mock
  - `GET /mock/credit/:clientId` - Obtener información de crédito mock
  - `POST /mock/orders` - Crear orden mock
  - `POST /mock/invoice` - Crear factura mock

### Orders Controller
- **Ruta**: `/orders`
- **Métodos**:
  - `POST /orders` - Crear nueva orden
  - `GET /orders` - Obtener todas las órdenes
  - `GET /orders/:id` - Obtener orden por ID
  - `PUT /orders/:id/status` - Actualizar estado de orden
  - `DELETE /orders/:id` - Eliminar orden por ID

### Products Controller
- **Ruta**: `/products`
- **Métodos**:
  - `POST /products` - Crear nuevo producto
  - `GET /products` - Obtener todos los productos
  - `GET /products/:id` - Obtener producto por ID
  - `GET /products/sku/:sku` - Obtener producto por SKU
  - `PUT /products/:id` - Actualizar producto por ID
  - `DELETE /products/:id` - Eliminar producto por ID

### Quotes Controller
- **Ruta**: `/quotes`
- **Métodos**:
  - `POST /quotes/email` - Recibir email de cotización
  - `GET /quotes` - Obtener todas las cotizaciones
  - `GET /quotes/:id` - Obtener cotización por ID
  - `POST /quotes/:id/pdf` - Generar PDF de cotización
  - `GET /quotes/:id/pdf` - Descargar PDF de cotización
  - `POST /quotes/:id/approve` - Aprobar cotización
  - `POST /quotes/:id/payment-link` - Crear link de pago
  - `POST /quotes/:id/pay` - Simular pago
  - `POST /quotes/:id/production` - Mover a producción
  - `POST /quotes/:id/ready` - Marcar como listo
  - `POST /quotes/:id/delivered` - Marcar como entregado
  - `GET /quotes/inbox/emails` - Obtener inbox de emails

## APIs en Software/dta/backend

### App Controller
- **Ruta**: `/`
- **Métodos**:
  - `GET /` - Endpoint de salud

### Flow Controller
- **Ruta**: `/flow`
- **Métodos**:
  - `POST /flow/process` - Procesar orden con validaciones mock

### Mock Controller
- **Ruta**: `/mock`
- **Métodos**:
  - `GET /mock/inventory` - Obtener inventario mock
  - `GET /mock/products/:sku` - Obtener producto por SKU mock
  - `GET /mock/credit/:clientId` - Obtener información de crédito mock
  - `POST /mock/orders` - Crear orden mock
  - `POST /mock/invoice` - Crear factura mock

## APIs en dta-oben-group/backend

### Orders Controller
- **Ruta**: `/orders`
- **Métodos**:
  - `GET /orders` - Obtener todas las órdenes (con filtro opcional por status)
  - `GET /orders/:id` - Obtener orden por ID
  - `POST /orders` - Crear nueva orden
  - `POST /orders/:id/approve` - Aprobar orden
  - `POST /orders/:id/process` - Procesar orden