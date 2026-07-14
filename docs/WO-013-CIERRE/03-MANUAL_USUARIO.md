# Manual de Usuario — Oben DTA

**Documento canónico generado al cierre de WO-013.**

## 1. Ingreso al sistema

Ingrese a la URL de su instalación, digite su correo y contraseña, y presione **Ingresar**. Si su licencia comercial no está vigente, verá una pantalla de aviso — sus datos permanecen intactos, solo se restringe el uso operativo hasta renovar.

## 2. Navegación

El menú lateral muestra únicamente las secciones para las que su usuario tiene permiso:

- **Centro de Operaciones** — estado en vivo del sistema y de las integraciones; acceso al botón "Ejecutar demo" (si su rol lo permite).
- **Dashboard** — indicadores clave (órdenes, ingresos, clientes).
- **Cotizaciones** — pipeline comercial completo.
- **Órdenes** — órdenes generadas a partir de cotizaciones pagadas.
- **Facturas** — facturas generadas a partir de órdenes.
- **Clientes** — catálogo de clientes y cupo de cartera.
- **Auditoría** — trazabilidad de todo lo ocurrido en el sistema (si tiene el permiso).
- **Administración** — gestión de usuarios y roles (solo administradores).

## 3. Flujo comercial (Cotizaciones)

El flujo puede iniciarse automáticamente al recibir un correo de un cliente, o manualmente desde **Cotizaciones**. Las etapas son:

1. **Correo recibido** — se identifica al cliente (o se crea uno nuevo si es la primera vez) y se generan los ítems cotizados a partir de los SKU mencionados en el correo.
2. **Cotización generada** — con subtotal, IVA y total calculados sobre precios reales del catálogo.
3. **PDF generado y enviado** — se genera el PDF de la cotización y se envía la respuesta al cliente por correo.
4. **Aprobación** — el cliente aprueba (validando cupo de cartera e inventario disponible) o rechaza.
5. **Link de pago** — se genera un link de pago para la cotización aprobada.
6. **Pago confirmado** — al confirmarse el pago se generan automáticamente una **Orden** y una **Factura reales**, visibles de inmediato en sus respectivas secciones.
7. **Producción → Listo para despacho → Entregado** — la orden avanza junto con la cotización hasta el cierre del ciclo.

Cada uno de estos pasos queda registrado en **Auditoría**, con fecha, actor y detalle.

## 4. Órdenes y Facturas

Las órdenes muestran cliente, productos, cantidades, totales y su estado actual. Una orden solo puede facturarse si no está bloqueada ni cancelada; el sistema impide generar dos facturas para la misma orden. Las facturas muestran el desglose de IVA, fecha de vencimiento (30 días por defecto) y estado ante DIAN.

## 5. Clientes

Cada cliente tiene un cupo de cartera (crédito máximo) y un saldo usado. El sistema valida automáticamente que una cotización no exceda el cupo disponible antes de aprobarla.

## 6. Demo automática

Si su rol incluye el permiso correspondiente, el botón **Ejecutar demo** del Centro de Operaciones corre el flujo comercial completo de punta a punta sobre datos reales (crea un cliente, una cotización, una orden y una factura genuinos) en aproximadamente 20 segundos, mostrando cada paso a medida que ocurre. Al finalizar, ofrece enlaces directos a la cotización, orden y factura generadas, y al dashboard y la auditoría. Es la forma más rápida de mostrar el sistema completo funcionando en una presentación.

## 7. Cierre de sesión

Use **Cerrar Sesión** en la parte inferior del menú lateral. Su sesión también se invalida automáticamente si un administrador restablece su contraseña o lo bloquea.
