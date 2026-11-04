/**
 * El buzón de Pedidos de Venta (pedidosdeventa.co@obengroup.com) existe para recibir solicitudes de pedido (Hernán, 4-nov-2026:
 * "ese correo solamente va a recibir esa solicitud de pedido"). Por eso, un correo de una PERSONA que el clasificador no reconoce
 * (naviera, COMEX o desconocido) se trata como pedido y pasa al CRM de Comercial, en vez de descartarse (así se perdió el pedido de
 * Mega Goglio). Quedan fuera:
 *  - los correos del sistema de Oben (notificaciones del ERP: "OV … Aprobada En Corte", "Cubicación de Proforma …", "Facturar Parcial");
 *  - las respuestas a lo que envía Xmart (listas de empaque, conjuntos de documentos, facturas rechazadas) y las respuestas automáticas.
 */
export const REMITENTES_DE_SISTEMA = ['notif.app.co@obengroup.com', 'sistema@oben-plus.local', 'pedidosdeventa.co@obengroup.com'];

const RESPUESTA_O_AUTOMATICO =
  /lista\s+de\s+empaque\s+[—–-]\s*orden|conjunto\s+de\s+documentos|factura\s+rechazada|respuesta\s+autom[aá]tica|automatic\s+reply|out\s+of\s+office|fuera\s+de\s+la\s+oficina|ha\s+compartido|undeliverable|delivery\s+status|no\s+se\s+(?:pudo|puede)\s+entregar|mail\s+delivery|l[ií]nea\s+base/i;

/** Categorías que el clasificador usa cuando NO entendió el correo; solo estas se convierten en pedido. */
const CATEGORIAS_SIN_FLUJO = new Set(['carrier', 'comex', 'unknown']);

export function esPedidoPorDefecto(from: string, subject: string, categoria: string): boolean {
  if (!CATEGORIAS_SIN_FLUJO.has(categoria)) return false;
  if (REMITENTES_DE_SISTEMA.includes(from.trim().toLowerCase())) return false;
  if (RESPUESTA_O_AUTOMATICO.test(subject ?? '')) return false;
  return true;
}
