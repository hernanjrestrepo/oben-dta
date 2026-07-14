# Manual de Administrador — Oben DTA

**Documento canónico generado al cierre de WO-013.** Sustituye a `MANUAL_ADMINISTRADOR.md` previo.

## 1. Gestión de usuarios (`/admin/users`)

Requiere el permiso `users.read` (y `users.create`/`users.update`/`users.delete` según la acción). Desde esta pantalla puede:

- **Crear** un usuario nuevo (nombre, correo, contraseña inicial).
- **Editar** datos de un usuario existente.
- **Asignar/desasignar perfiles** (roles) — clic sobre cada insignia de perfil para alternar su asignación; un usuario puede tener múltiples perfiles simultáneos.
- **Activar / Desactivar** un usuario sin eliminarlo.
- **Bloquear / Desbloquear** manualmente (independiente del bloqueo automático por fuerza bruta).
- **Restablecer contraseña** — invalida automáticamente todas las sesiones activas de ese usuario (rotación de `tokenVersion`).
- **Eliminar** un usuario (no se permite auto-eliminación).

## 2. Matriz de permisos (`/admin/roles`)

Cree o edite perfiles (roles) personalizados marcando permisos agrupados por módulo: Clientes, Productos, Cotizaciones, Órdenes, Facturas, Dashboard, Integraciones, Administración, Configuración, Auditoría, Licencias, Automatizaciones, Producción, Exportaciones, Finanzas, Reportes, Inventario. No hay permisos hardcodeados: todo lo que ve en la matriz es exactamente lo que el sistema evalúa en cada solicitud.

Un rol puede asignarse a múltiples usuarios y un usuario puede tener múltiples roles — sus permisos efectivos son la unión de todos sus roles asignados.

## 3. Auditoría (`/auditoria`)

Requiere `auditoria.read`. Muestra cada evento de negocio (creación de cliente, generación de cotización, envío de correo, aprobación, pago, creación de orden/factura, cambios de licencia, etc.) con fecha, flujo, acción, entidad afectada, estado y detalle expandible en JSON. Es de solo lectura y no puede editarse ni borrarse desde la interfaz — es el registro de auditoría inmutable del tenant.

## 4. Licenciamiento

El estado de la licencia del tenant se refleja automáticamente en el login y en cada pantalla (`LicenseGate`). Si la licencia vence o se suspende, el sistema bloquea el uso operativo mostrando el motivo exacto (vencida, suspendida, revocada, firma inválida, instalación no coincidente) sin borrar ningún dato. La renovación y los cambios de estado de licencia los gestiona el SuperAdmin de Paradixe desde el panel de plataforma (`/platform`) — no hay forma de renovar o forzar el estado de una licencia desde dentro del propio tenant, por diseño.

## 5. Configuración de integraciones

Cada sistema externo (NetSuite, VETA, Armstrong, DIAN, Oracle, etc.) corre hoy sobre un simulador funcional visible en el Centro de Operaciones. Para conectar el sistema real de Oben cuando esté disponible, el equipo de Paradixe configura por tenant: URL base, esquema de autenticación (API key / bearer / basic) y credenciales — sin necesidad de recompilar ni redesplegar el producto.

## 6. Buenas prácticas

- No elimine usuarios con historial de operaciones si puede desactivarlos en su lugar — preserva la trazabilidad de auditoría.
- Revise periódicamente la sección Auditoría ante cualquier comportamiento inesperado; cada acción del sistema queda registrada con su actor.
- Los perfiles personalizados deben otorgar el mínimo permiso necesario por rol de negocio (principio de menor privilegio).
