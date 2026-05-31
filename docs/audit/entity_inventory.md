# Inventario Completo de Entidades

## Entidades en backend/src/entities/

### Client Entity
- **Archivo**: `backend/src/entities/client.entity.ts`
- **Descripción**: Representa un cliente con información de contacto y límites de crédito
- **Campos**:
  - id (UUID, primary key)
  - clientId (string, unique)
  - name (string)
  - email (string)
  - phone (string, nullable)
  - address (string, nullable)
  - creditLimit (decimal, precision 15 scale 2)
  - usedCredit (decimal, precision 15 scale 2)
  - isActive (boolean, default true)
  - orders (relación OneToMany con Order)
  - createdAt (timestamp)
  - updatedAt (timestamp)

### Order Entity
- **Archivo**: `backend/src/entities/order.entity.ts`
- **Descripción**: Representa una orden de pedido con estados detallados
- **Enumeración**: OrderStatus (DRAFT, PENDING_VALIDATION, CONFIRMED, PENDING_PRODUCTION, IN_PRODUCTION, READY_FOR_DELIVERY, DELIVERED, BLOCKED, CANCELLED)
- **Campos**:
  - id (UUID, primary key)
  - orderNumber (string, unique)
  - client (relación ManyToOne con Client)
  - clientId (string)
  - totalAmount (decimal, precision 15 scale 2)
  - status (OrderStatus enum)
  - notes (text, nullable)
  - blockedReason (string, nullable)
  - validatedBy (string, nullable)
  - validatedAt (timestamp, nullable)
  - invoiceNumber (string, nullable)
  - items (relación OneToMany con OrderItem)
  - createdAt (timestamp)
  - updatedAt (timestamp)

### OrderItem Entity
- **Archivo**: `backend/src/entities/order-item.entity.ts`
- **Descripción**: Representa un ítem dentro de una orden
- **Campos**:
  - id (UUID, primary key)
  - order (relación ManyToOne con Order)
  - orderId (string)
  - product (relación ManyToOne con Product)
  - productId (string)
  - quantity (number)
  - unitPrice (decimal, precision 15 scale 2)
  - totalPrice (decimal, precision 15 scale 2)
  - notes (string, nullable)

### Product Entity
- **Archivo**: `backend/src/entities/product.entity.ts`
- **Descripción**: Representa un producto con información de inventario
- **Campos**:
  - id (UUID, primary key)
  - sku (string, unique)
  - name (string)
  - description (text, nullable)
  - price (decimal, precision 15 scale 2)
  - stock (number, default 0)
  - committed (number, default 0)
  - isActive (boolean, default true)
  - orderItems (relación OneToMany con OrderItem)
  - createdAt (timestamp)
  - updatedAt (timestamp)

### Quote Entity
- **Archivo**: `backend/src/entities/quote.entity.ts`
- **Descripción**: Representa una cotización con estados de flujo comercial
- **Enumeración**: QuoteStatus (RECEIVED, PARSING, QUOTED, SENT, APPROVED, ORDERED, PAYMENT_PENDING, PAID, IN_PRODUCTION, READY_FOR_DELIVERY, DELIVERED, REJECTED)
- **Campos**:
  - id (UUID, primary key)
  - quoteNumber (string, unique)
  - client (relación ManyToOne con Client)
  - clientId (string)
  - originalEmail (text, nullable)
  - parsedRequest (text, nullable)
  - items (relación OneToMany con QuoteItem)
  - subtotal (decimal, precision 15 scale 2)
  - taxAmount (decimal, precision 15 scale 2)
  - total (decimal, precision 15 scale 2)
  - status (QuoteStatus enum)
  - pdfUrl (text, nullable)
  - paymentLink (text, nullable)
  - invoiceNumber (text, nullable)
  - approvedAt (timestamp, nullable)
  - paidAt (timestamp, nullable)
  - deliveredAt (timestamp, nullable)
  - notes (text, nullable)
  - createdAt (timestamp)
  - updatedAt (timestamp)

### QuoteItem Entity
- **Archivo**: `backend/src/entities/quote-item.entity.ts`
- **Descripción**: Representa un ítem dentro de una cotización
- **Campos**:
  - id (UUID, primary key)
  - quote (relación ManyToOne con Quote)
  - quoteId (string)
  - product (relación ManyToOne con Product)
  - productId (string)
  - quantity (number)
  - unitPrice (decimal, precision 15 scale 2)
  - totalPrice (decimal, precision 15 scale 2)

### Invoice Entity
- **Archivo**: `backend/src/entities/invoice.entity.ts`
- **Descripción**: Representa una factura con estados de facturación y DIAN
- **Enumeración**: InvoiceStatus (PENDING, APPROVED, SENT, PAID, OVERDUE, CANCELLED)
- **Enumeración**: DianStatus (PENDING, ACCEPTED, REJECTED)
- **Campos**:
  - id (UUID, primary key)
  - invoiceNumber (string, unique)
  - order (relación ManyToOne con Order)
  - orderId (string)
  - amount (decimal, precision 15 scale 2)
  - taxAmount (decimal, precision 15 scale 2)
  - totalAmount (decimal, precision 15 scale 2)
  - status (InvoiceStatus enum)
  - dianStatus (DianStatus enum)
  - dianCufe (string, nullable)
  - dianSentAt (timestamp, nullable)
  - dueDate (timestamp, nullable)
  - paidAt (timestamp, nullable)
  - createdAt (timestamp)
  - updatedAt (timestamp)

### User Entity
- **Archivo**: `backend/src/entities/user.entity.ts`
- **Descripción**: Representa un usuario del sistema con roles
- **Enumeración**: UserRole (ADMIN, SALES, PRODUCTION, FINANCE)
- **Campos**:
  - id (UUID, primary key)
  - firstName (string)
  - lastName (string)
  - email (string, unique)
  - passwordHash (string)
  - role (UserRole enum)
  - isActive (boolean, default true)
  - googleId (string, nullable)
  - microsoftId (string, nullable)
  - createdAt (timestamp)
  - updatedAt (timestamp)

## Entidades en dta-oben-group/backend/src/modules/orders/

### Order Interface
- **Archivo**: `dta-oben-group/backend/src/modules/orders/order.entity.ts`
- **Descripción**: Interfaz para representar una orden con estados simplificados
- **Enumeración**: OrderStatus (received, parsed, quoted, approved, inventory-checked, production-activated, packed, shipped, billed, delivered)
- **Campos**:
  - id (string)
  - clientId (string)
  - clientName (string)
  - status (OrderStatus)
  - items (array de OrderItem)
  - total (number)
  - currency (string)
  - createdAt (Date)
  - updatedAt (Date)
  - proformaId (string, optional)
  - invoiceId (string, optional)
  - shippingId (string, optional)

### OrderItem Interface
- **Archivo**: `dta-oben-group/backend/src/modules/orders/order.entity.ts`
- **Descripción**: Interfaz para representar un ítem de orden
- **Campos**:
  - sku (string)
  - name (string)
  - quantity (number)
  - unitPrice (number)
  - totalPrice (number)