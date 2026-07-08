# Manual Operativo — DTA Oben (uso diario para el equipo)

> Distinto de `MANUAL_OPERACION.md` (que cubre comandos de servidor: levantar/parar/backup).
> Este manual es para quien **usa la plataforma día a día** desde el navegador — ventas,
> producción, finanzas — no para quien la administra técnicamente.

## 1. Acceso
1. Abrir la URL de DTA (hoy, mientras no haya URL pública, vía túnel: `http://localhost:3000`
   — ver `DESPLIEGUE_DEFINITIVO.md`).
2. Iniciar sesión con el correo y contraseña asignados por el administrador.
3. Si la sesión expira, el sistema redirige automáticamente a login.

## 2. Centro de Operaciones IA
Es la pantalla principal. Tiene dos asistentes y KPIs en vivo:

### EVA — asistente de órdenes y facturación
- Escribir en lenguaje natural lo que se necesita, por ejemplo:
  *"Crea una orden para el cliente ACME de 10 unidades de SKU-001"*.
- EVA interpreta el pedido, valida el cliente, valida crédito disponible, crea la orden y, si
  corresponde, la factura — **todo persiste en la base de datos real**, no es una simulación.
- En la respuesta se puede ver la traza de pasos que ejecutó (qué validó, qué creó), y los
  números de orden/factura generados.
- Si el crédito del cliente no alcanza, EVA **bloquea la operación** y explica por qué — no la
  fuerza.
- Si EVA no entiende el pedido o falta información (ej. no existe el producto), lo dice
  explícitamente en vez de adivinar.

### ADÁN — asistente de conocimiento corporativo
- Preguntar en lenguaje natural sobre procedimientos, políticas o manuales ya cargados, por
  ejemplo: *"¿Cuál es el procedimiento de exportación a Perú?"*.
- ADÁN responde citando el documento exacto de donde sacó la información (nombre de archivo y
  fragmento).
- Si no hay ningún documento relevante cargado, ADÁN lo dice — **no inventa una respuesta**.
- Mientras Oben no entregue los documentos reales (ver `BASE_CONOCIMIENTO_OBEN.md`), las
  respuestas de ADÁN estarán limitadas a lo que ya esté cargado en ese momento.

### KPIs
Los indicadores del Centro de Operaciones (órdenes, clientes, ingresos) se calculan en vivo
desde los datos reales de la base — no son cifras de ejemplo.

## 3. Gestión de clientes, productos y órdenes (módulos clásicos)
Además de EVA, la plataforma tiene pantallas tradicionales para:
- **Clientes**: ver, crear, editar, eliminar.
- **Productos**: ver, crear, editar, eliminar (incluye SKU, precio, stock).
- **Órdenes**: ver listado, ver detalle, cambiar estado, eliminar.
- **Facturas**: ver listado y detalle (la creación ocurre normalmente vía EVA o al confirmar una orden).
- **Cotizaciones**: flujo de cotización → aprobación → pago → producción → entrega.

## 4. Errores comunes y qué significan
| Situación | Significado |
|---|---|
| "Crédito insuficiente" al pedir una orden vía EVA | El cliente no tiene cupo disponible — es una validación real, no un bug. |
| ADÁN responde "no tengo información sobre eso" | No hay ningún documento cargado que cubra esa pregunta — pedir que se cargue el documento correspondiente. |
| Redirigido a login sin razón aparente | La sesión expiró (token JWT vencido) — volver a iniciar sesión. |
| Una integración (VETA/NetSuite/Armstrong) muestra "pendiente de credenciales" | Esperado hoy — esos sistemas externos aún no tienen acceso configurado por Oben. |

## 5. Qué NO puede hacer todavía la plataforma
- No envía datos a VETA/NetSuite/Armstrong (integraciones en modo solo lectura, pendientes de
  credenciales).
- No permite que un usuario no-admin cambie su propio rol.
- No tiene una pantalla de administración de usuarios (lo gestiona el administrador
  directamente — ver `MANUAL_ADMINISTRADOR.md`).

## 6. A quién consultar
- Problemas de acceso o permisos → administrador del sistema (`MANUAL_ADMINISTRADOR.md`).
- Preguntas sobre qué documentos cargar para que ADÁN los conozca → `BASE_CONOCIMIENTO_OBEN.md`.
- Problemas de servidor/infraestructura → equipo técnico (`MANUAL_TECNICO.md`,
  `MANUAL_OPERACION.md`).
