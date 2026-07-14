# Documento de Capacitación — Oben DTA

**Documento canónico generado al cierre de WO-013.** Guía de entrenamiento para el equipo de Oben, estructurada como una sesión de capacitación progresiva.

## Sesión 1 — Orientación (15 min)

1. Inicie sesión con su usuario y recorra el menú lateral — observe que solo ve las secciones para las que tiene permiso.
2. Abra **Centro de Operaciones** y revise el panel de integraciones: cada tarjeta representa un sistema externo corriendo en modo simulador.
3. Explique la diferencia entre **modo simulador** (hoy) y **modo real** (cuando Oben entregue credenciales): mismas validaciones de negocio, mismos errores, el usuario final no percibe diferencia funcional.

## Sesión 2 — El flujo comercial de punta a punta (20 min)

La forma más rápida de entender todo el sistema es ejecutar la **demo automática**:

1. En Centro de Operaciones, presione **Ejecutar demo**.
2. Observe cómo se revelan los pasos uno a uno: correo recibido → cliente identificado/creado → cotización generada → PDF enviado → aprobación → orden → factura → producción → entrega.
3. Al finalizar, siga los enlaces a la cotización, orden y factura recién creadas — son datos reales, no una animación: puede verificarlos en las secciones correspondientes y en Auditoría.
4. Repita el ejercicio manualmente desde **Cotizaciones → Nueva** para ver el mismo flujo paso a paso con control total del operador.

## Sesión 3 — Administración (20 min)

1. Vaya a **Administración → Usuarios**. Cree un usuario de prueba, asígnele un perfil existente, desactívelo y vuelva a activarlo.
2. Vaya a **Administración → Roles**. Cree un perfil personalizado con permisos limitados (por ejemplo, solo lectura de Clientes y Cotizaciones) y asígnelo al usuario de prueba para ver cómo cambia su menú al iniciar sesión con él.
3. Elimine el usuario de prueba al finalizar el ejercicio.

## Sesión 4 — Auditoría y licenciamiento (15 min)

1. Abra **Auditoría** y localice los eventos generados por el ejercicio de la Sesión 2 — note que cada paso del flujo comercial quedó registrado con fecha y detalle.
2. Explique el concepto de licencia comercial: validación mensual, bloqueo puramente operativo sin pérdida de datos, y que solo el SuperAdmin de Paradixe puede renovarla o cambiar su estado.

## Sesión 5 — Preguntas frecuentes

- **¿Puedo perder información si la licencia vence?** No. El bloqueo es exclusivamente de uso; los datos permanecen intactos y se recupera el acceso al renovar.
- **¿Qué pasa si edito una fecha de vencimiento directamente en la base de datos?** La licencia queda automáticamente inválida (firma criptográfica no coincide) — no existe forma de extenderla por fuera del proceso oficial de renovación.
- **¿Puedo copiar esta instalación a otro servidor?** No sin una nueva licencia válida para esa instalación — el sistema detecta el cambio de base de datos física y rechaza la licencia original.
- **¿Cuándo veo datos reales de NetSuite/VETA/Armstrong en vez del simulador?** Cuando Oben decida qué integraciones activar y entregue las credenciales correspondientes a Paradixe.
