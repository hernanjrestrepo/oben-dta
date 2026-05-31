# Diagrama Entidad-Relación

## Entidades Principales

```
┌─────────────────────────┐
│        CLIENTES         │
├─────────────────────────┤
│ id (UUID) PK           │
│ clientId (string) UK   │
│ name (string)          │
│ email (string)         │
│ phone (string)         │
│ address (string)       │
│ creditLimit (decimal)  │
│ usedCredit (decimal)   │
│ isActive (boolean)     │
│ createdAt (timestamp)  │
│ updatedAt (timestamp)  │
└─────────────────────────┘
           │
           │ 1
           │
           ▼ M
┌─────────────────────────┐
│         ORDENES         │
├─────────────────────────┤
│ id (UUID) PK           │
│ orderNumber (string) UK│
│ clientId (string) FK   │
│ totalAmount (decimal)  │
│ status (enum)          │
│ notes (text)           │
│ blockedReason (string) │
│ validatedBy (string)   │
│ validatedAt (timestamp)│
│ invoiceNumber (string) │
│ createdAt (timestamp)  │
│ updatedAt (timestamp)  │
└─────────────────────────┘
           │
           │ 1
           │
           ▼ M
┌─────────────────────────┐
│      ITEMS_ORDEN        │
├─────────────────────────┤
│ id (UUID) PK           │
│ orderId (string) FK    │
│ productId (string) FK  │
│ quantity (number)      │
│ unitPrice (decimal)    │
│ totalPrice (decimal)   │
│ notes (string)         │
└─────────────────────────┘
           ▲ M
           │
           │ 1
┌─────────────────────────┐
│        PRODUCTOS        │
├─────────────────────────┤
│ id (UUID) PK           │
│ sku (string) UK        │
│ name (string)          │
│ description (text)     │
│ price (decimal)        │
│ stock (number)         │
│ committed (number)     │
│ isActive (boolean)     │
│ createdAt (timestamp)  │
│ updatedAt (timestamp)  │
└─────────────────────────┘

┌─────────────────────────┐
│       COTIZACIONES      │
├─────────────────────────┤
│ id (UUID) PK           │
│ quoteNumber (string) UK│
│ clientId (string) FK   │
│ originalEmail (text)   │
│ parsedRequest (text)   │
│ subtotal (decimal)     │
│ taxAmount (decimal)    │
│ total (decimal)        │
│ status (enum)          │
│ pdfUrl (text)          │
│ paymentLink (text)     │
│ invoiceNumber (text)   │
│ approvedAt (timestamp) │
│ paidAt (timestamp)     │
│ deliveredAt (timestamp)│
│ notes (text)           │
│ createdAt (timestamp)  │
│ updatedAt (timestamp)  │
└─────────────────────────┘
           │
           │ 1
           │
           ▼ M
┌─────────────────────────┐
│    ITEMS_COTIZACION     │
├─────────────────────────┤
│ id (UUID) PK           │
│ quoteId (string) FK    │
│ productId (string) FK  │
│ quantity (number)      │
│ unitPrice (decimal)    │
│ totalPrice (decimal)   │
└─────────────────────────┘

┌─────────────────────────┐
│        FACTURAS         │
├─────────────────────────┤
│ id (UUID) PK           │
│ invoiceNumber (string) UK
│ orderId (string) FK    │
│ amount (decimal)       │
│ taxAmount (decimal)    │
│ totalAmount (decimal)  │
│ status (enum)          │
│ dianStatus (enum)      │
│ dianCufe (string)      │
│ dianSentAt (timestamp) │
│ dueDate (timestamp)    │
│ paidAt (timestamp)     │
│ createdAt (timestamp)  │
│ updatedAt (timestamp)  │
└─────────────────────────┘

┌─────────────────────────┐
│         USUARIOS        │
├─────────────────────────┤
│ id (UUID) PK           │
│ firstName (string)     │
│ lastName (string)      │
│ email (string) UK      │
│ passwordHash (string)  │
│ role (enum)            │
│ isActive (boolean)     │
│ googleId (string)      │
│ microsoftId (string)   │
│ createdAt (timestamp)  │
│ updatedAt (timestamp)  │
└─────────────────────────┘
```

## Relaciones

### Cliente ↔ Orden
- **Cardinalidad**: 1 cliente puede tener M órdenes
- **Tipo**: Uno a Muchos
- **Implementación**: Foreign key `clientId` en tabla `orders`

### Orden ↔ Item Orden
- **Cardinalidad**: 1 orden puede tener M items
- **Tipo**: Uno a Muchos
- **Implementación**: Foreign key `orderId` en tabla `order_items`

### Producto ↔ Item Orden
- **Cardinalidad**: 1 producto puede estar en M items de orden
- **Tipo**: Uno a Muchos
- **Implementación**: Foreign key `productId` en tabla `order_items`

### Cliente ↔ Cotización
- **Cardinalidad**: 1 cliente puede tener M cotizaciones
- **Tipo**: Uno a Muchos
- **Implementación**: Foreign key `clientId` en tabla `quotes`

### Cotización ↔ Item Cotización
- **Cardinalidad**: 1 cotización puede tener M items
- **Tipo**: Uno a Muchos
- **Implementación**: Foreign key `quoteId` en tabla `quote_items`

### Producto ↔ Item Cotización
- **Cardinalidad**: 1 producto puede estar en M items de cotización
- **Tipo**: Uno a Muchos
- **Implementación**: Foreign key `productId` en tabla `quote_items`

### Orden ↔ Factura
- **Cardinalidad**: 1 orden puede tener 1 factura
- **Tipo**: Uno a Uno
- **Implementación**: Foreign key `orderId` en tabla `invoices`

## Enumeraciones

### OrderStatus
```
DRAFT, PENDING_VALIDATION, CONFIRMED, PENDING_PRODUCTION, 
IN_PRODUCTION, READY_FOR_DELIVERY, DELIVERED, BLOCKED, CANCELLED
```

### QuoteStatus
```
RECEIVED, PARSING, QUOTED, SENT, APPROVED, ORDERED, 
PAYMENT_PENDING, PAID, IN_PRODUCTION, READY_FOR_DELIVERY, 
DELIVERED, REJECTED
```

### InvoiceStatus
```
PENDING, APPROVED, SENT, PAID, OVERDUE, CANCELLED
```

### DianStatus
```
PENDING, ACCEPTED, REJECTED
```

### UserRole
```
ADMIN, SALES, PRODUCTION, FINANCE
```

## Índices

### Índices Únicos
- `clients.clientId`
- `orders.orderNumber`
- `products.sku`
- `quotes.quoteNumber`
- `invoices.invoiceNumber`
- `users.email`

### Índices Compuestos
- `orders.clientId` para búsquedas por cliente
- `order_items.orderId` para búsquedas de items por orden
- `quotes.clientId` para búsquedas por cliente
- `quote_items.quoteId` para búsquedas de items por cotización

## Restricciones

### Restricciones de Integridad Referencial
- `orders.clientId` referencia a `clients.id`
- `order_items.orderId` referencia a `orders.id`
- `order_items.productId` referencia a `products.id`
- `quotes.clientId` referencia a `clients.id`
- `quote_items.quoteId` referencia a `quotes.id`
- `quote_items.productId` referencia a `products.id`
- `invoices.orderId` referencia a `orders.id`

### Restricciones de Dominio
- `creditLimit` y `usedCredit` deben ser valores decimales no negativos
- `stock` y `committed` deben ser valores enteros no negativos
- `isActive` debe ser booleano
- `role` debe ser uno de los valores definidos en UserRole
- `status` en cada entidad debe ser uno de los valores definidos en sus respectivos enums