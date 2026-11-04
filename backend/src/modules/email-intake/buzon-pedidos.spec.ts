import { esPedidoPorDefecto } from './buzon-pedidos';

describe('buzón de Pedidos de Venta: lo que una persona manda y no se entiende es un pedido', () => {
  it('el aviso de Mega Goglio (clasificado "carrier") pasa a pedido', () => {
    expect(esPedidoPorDefecto('sebastiancastaneda@obengroup.com', 'RV: PI 11831 PEDIDO 1737 - OPP FILM COLOMBIA - 23,2t BOPET ET12TA', 'carrier')).toBe(true);
  });
  it('un correo desconocido o COMEX de una persona también', () => {
    expect(esPedidoPorDefecto('alejandramolinares@obengroup.com', 'NUEVO PEDIDO VICTOR CASTAÑEDA', 'unknown')).toBe(true);
    expect(esPedidoPorDefecto('cliente@empresa.com', 'Material para diciembre', 'comex')).toBe(true);
  });
  it('las notificaciones del sistema de Oben no son pedidos', () => {
    expect(esPedidoPorDefecto('notif.app.co@obengroup.com', 'Proforma 11700 - Facturar Parcial', 'unknown')).toBe(false);
    expect(esPedidoPorDefecto('sistema@oben-plus.local', 'Línea base — inicio del conector de correo real', 'unknown')).toBe(false);
  });
  it('las respuestas a lo que envía Xmart y las respuestas automáticas no son pedidos', () => {
    expect(esPedidoPorDefecto('jorgerestrepo@obengroup.com', 'RE: Lista de Empaque — Orden 11166', 'comex')).toBe(false);
    expect(esPedidoPorDefecto('x@obengroup.com', 'Respuesta automática: Lista de Empaque — Orden 11166', 'comex')).toBe(false);
    expect(esPedidoPorDefecto('alejandramolinares@obengroup.com', 'RE: Factura rechazada por APICrearInvoiceParadixe (PF 11700)', 'unknown')).toBe(false);
    expect(esPedidoPorDefecto('alejandramolinares@obengroup.com', 'Alejandra Molinares (Colombia) ha compartido "SEGUIMIENTO"', 'unknown')).toBe(false);
  });
  it('lo que el clasificador ya entendió (cotización, cubicación, factura parcial…) no se toca', () => {
    expect(esPedidoPorDefecto('cliente@empresa.com', 'Cotización', 'quote_request')).toBe(false);
    expect(esPedidoPorDefecto('notif.app.co@obengroup.com', 'Cubicación de Proforma 11 - X', 'comercial_cubicacion')).toBe(false);
  });
});
