import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProformasObenService, explicarRechazo } from './proformas-oben.service';
import { resultadoEscritura } from '../integrations/hub/adapters/oben-comercial';

// Datos reales del servidor de pruebas de Oben (22-oct): ALADDIN PACKAGING LLC. (9995 / 1828) y la referencia de la PF 13392.
const CLIENTE = { CodSec_Entity: 9995, Nombre_Cliente: 'OBEN US, LLC', Pais_Cliente: 'USA', CodSed_CustomerAddress: 1828, Target_Customer: 'ALADDIN PACKAGING LLC.' };
const PAR = {
  CodSec_CommercialCondition: 25, CodSec_Currency: 1, CodSec_EtiquetaBobina: 5, CodSec_EtiquetaPallet: 1, CodSec_Incoterms: 7, CodSec_CityPort: 1186,
  CiudadPuertoDestino: 'NEW YORK', CodSec_City: 1186, Pais: 'USA', Desde: 'CARTAGENA - COLOMBIA', Hasta: 'NEWBURGH, NY 12550', Peso_Bruto_Maximo: 24493.97,
  Nota_Etiqueta: 'ALADDIN PACKAGING LLC', Nota_Operativa: 'MAXIMO 1 EMPALME POR BOBINA\r\nNO CORES CON EMPALMES', Nota_Especial: 'COMMODITIES 10% EMPALME', Consignado: '', Notificado: '',
};
const PRODUCTOS = [
  { CodSec_Prod: 5622, CodSec_LineFilm: 3, Linea: 'BOPET', Pelicula: 'ET---0012RT', Referencia: 'ET---0012RT0600S0760' },
  { CodSec_Prod: 2, CodSec_LineFilm: 1, Linea: 'BOPP', Pelicula: 'FCH--0030TN', Referencia: 'FCH--0030TN0400T0570' },
];
const PARTIDAS = [
  { CodSec_TariffDeparture: 1, Valor: '3920620090', Descripcion: 'P.A. Bopet Exportacion - Nacional', CodSec_Line: 3, Linea: 'BOPET' },
  { CodSec_TariffDeparture: 3, Valor: '3920', Descripcion: 'P.A. Bopp Nacional', CodSec_Line: 1, Linea: 'BOPP' },
  { CodSec_TariffDeparture: 4, Valor: '3920.20.90.00', Descripcion: 'P.A. Bopp Exportacion', CodSec_Line: 1, Linea: 'BOPP' },
];
const ENTRADA = {
  cliente: 9995,
  direccion: 1828,
  ordenCompra: 'OC-PRUEBA-1',
  fechaEntrega: '2026-12-06',
  fechaDespacho: '2026-11-21',
  lineas: [{ referencia: 'ET---0012RT0600S0760', kilos: 1000, precio: 2.5 }],
};

type Resp = { ok: boolean; data?: unknown; error?: string; mode?: string };

function armar(opts: { escribir?: (paso: string, valores: Record<string, unknown>) => Resp; empaque?: (prod: number) => boolean } = {}) {
  const filas: Array<Record<string, unknown>> = [];
  const repo = {
    create: (x: Record<string, unknown>) => ({ ...x }),
    save: jest.fn(async (x: Record<string, unknown>) => {
      if (!x.id) x.id = `p${filas.length + 1}`;
      if (!filas.includes(x)) filas.push(x);
      return x;
    }),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => filas.find((f) => (where.id ? f.id === where.id : f.ordenCompra === where.ordenCompra && f.servidor === where.servidor)) ?? null),
    find: jest.fn(async () => filas),
  };
  const maestros = {
    maestro: jest.fn(async (nombre: string, o: { buscar?: string } = {}) => {
      const base = nombre === 'clientes' ? [CLIENTE] : nombre === 'productos' ? PRODUCTOS : PARTIDAS;
      const q = String(o.buscar ?? '').toUpperCase();
      const items = q ? base.filter((f) => Object.values(f).some((v) => String(v).toUpperCase().includes(q))) : base;
      return { items, total: items.length, simulado: false };
    }),
    parametrizacion: jest.fn(async () => ({ datos: PAR, simulado: false })),
    validarEmpaque: jest.fn(async (p: { codSecProduct: number }) => {
      const ok = opts.empaque ? opts.empaque(p.codSecProduct) : true;
      return { valido: ok, mensaje: ok ? 'OK' : 'No se encontró Maestro de Empaque para el producto seleccionado y su destino.', simulado: false };
    }),
  };
  const llamadas: Array<{ paso: string; valores: Record<string, unknown> }> = [];
  const hub = {
    call: jest.fn(async (_s: string, _op: string, args: { paso: string; valores: Record<string, unknown> }) => {
      llamadas.push(args);
      if (opts.escribir) return opts.escribir(args.paso, args.valores);
      return args.paso === 'encabezado' ? { ok: true, data: { ok: true, codigoInterno: 13392, numeroPF: '11600' } } : { ok: true, data: { ok: true } };
    }),
  };
  const tenants = { findOne: jest.fn(async () => ({ integrationConfig: { obenCostOrder: {} } })) };
  const audit = { log: jest.fn(async () => undefined) };
  const svc = new ProformasObenService(hub as never, { tenantId: 't1', userId: 'u1' } as never, audit as never, maestros as never, repo as never, tenants as never);
  return { svc, llamadas, filas, maestros };
}

describe('Proformas en OBEN MAS (APIs comerciales, servidor de pruebas)', () => {
  it('arma el encabezado con la parametrización de Oben: puerto como código, fechas con hora, exportación, partida por línea', async () => {
    const { svc } = armar();
    const v = await svc.previsualizar(ENTRADA);
    expect(v.bloqueos).toEqual([]);
    expect(v.servidor).toBe('pruebas');
    expect(v.destino).toBe('ALADDIN PACKAGING LLC.');
    expect(v.encabezado).toMatchObject({
      CodSecEntity: 9995, CodSecComercialCondition: 25, CodSecIncoterm: 7, CodSecCurrency: 1, CodSecCity: 1186,
      DestinationPort: 1186, CodSecCityDestinationPort: 1186, CodSedCustomerAddress: 1828, CodSecEtiquetaPallet: 1, CodSecEtiquetaBobina: 5,
      From: 'CARTAGENA - COLOMBIA', To: 'NEWBURGH, NY 12550', Export: 'true', Sample: 'false', Stock: 'false', SubTotal: 2500, Total: 2500, PurchaseOrder: 'OC-PRUEBA-1',
    });
    expect(String(v.encabezado.DeliveryDate)).toMatch(/^2026-12-06 \d{2}:\d{2}:\d{2}$/);
    expect(String(v.encabezado.InvoiceMonth)).toMatch(/^2026-11-21 \d{2}:\d{2}:\d{2}$/);
    expect(v.lineas[0]).toMatchObject({ codSecProduct: 5622, codSecTariff: 1, partida: '3920620090', kilos: 1000, precio: 2.5, etiqueta: 'ALADDIN PACKAGING LLC' });
    expect(v.empaque).toEqual([{ referencia: 'ET---0012RT0600S0760', valido: true, mensaje: 'OK' }]);
  });

  it('BOPP de exportación toma la partida de exportación, no la nacional', async () => {
    const { svc } = armar();
    const v = await svc.previsualizar({ ...ENTRADA, lineas: [{ referencia: 'FCH--0030TN0400T0570', kilos: 500, precio: 3 }] });
    expect(v.lineas[0]).toMatchObject({ codSecTariff: 4, partida: '3920.20.90.00' });
  });

  it('sin Maestro de Empaque no se envía nada a Oben y se explica', async () => {
    const { svc, llamadas } = armar({ empaque: () => false });
    const v = await svc.previsualizar(ENTRADA);
    expect(v.bloqueos.join(' ')).toMatch(/no tiene Maestro de Empaque para ALADDIN PACKAGING LLC\..*Planeación debe crearlo/);
    await expect(svc.crear(ENTRADA, 'Hernán')).rejects.toThrow(BadRequestException);
    expect(llamadas).toHaveLength(0);
  });

  it('crea encabezado y detalle; guarda el número de la PF y cada paso', async () => {
    const { svc, llamadas } = armar();
    const p = await svc.crear(ENTRADA, 'Hernán');
    // Número oficial (seguimiento de Comercial) y código interno (lo que piden detalle, OV y activación).
    expect(p).toMatchObject({ estado: 'creada', numeroPF: '11600', codigoInterno: 13392, error: null, servidor: 'pruebas' });
    expect(llamadas.map((l) => l.paso)).toEqual(['encabezado', 'detalle']);
    expect(llamadas[1].valores).toMatchObject({ CodSecSalesOrderHeadPF: 13392, CodSecProduct: 5622, Quantity: 1000, Price: 2.5, CodSecTariff: 1, CodSecEntity: 9995, CodSecEntityAddress: 1828, CodSecCity: 1186 });
    expect(p.pasos.map((x) => `${x.paso}:${x.respuesta}`)).toEqual(['encabezado:PF 11600 · código interno 13392', 'detalle:OK']);
    // La misma orden de compra no crea otra proforma.
    await expect(svc.crear(ENTRADA, 'Hernán')).rejects.toThrow(ConflictException);
  });

  it('si una línea falla, reintentar sigue desde ahí sin repetir el encabezado ni las líneas ya creadas', async () => {
    let falla = true;
    const { svc, llamadas } = armar({
      escribir: (paso, valores) => {
        if (paso === 'encabezado') return { ok: true, data: { ok: true, codigoInterno: 500, numeroPF: '11601' } };
        if (paso === 'detalle' && valores.CodSecProduct === 2 && falla) return { ok: false, error: 'BUSINESS_ERROR: No se pudo inserta los datos' };
        return { ok: true, data: { ok: true } };
      },
    });
    const entrada = { ...ENTRADA, lineas: [ENTRADA.lineas[0], { referencia: 'FCH--0030TN0400T0570', kilos: 500, precio: 3 }] };
    const p1 = await svc.crear(entrada, 'Hernán');
    expect(p1).toMatchObject({ estado: 'encabezado', codigoInterno: 500, numeroPF: '11601' });
    expect(p1.error).toMatch(/Oben rechazó la línea 2 del detalle sin decir qué dato falla/);
    falla = false;
    const p2 = await svc.reintentar(String(p1.id), 'Hernán');
    expect(p2.estado).toBe('creada');
    expect(llamadas.map((l) => l.paso)).toEqual(['encabezado', 'detalle', 'detalle', 'detalle']);
    expect(llamadas.filter((l) => l.paso === 'detalle' && l.valores.CodSecProduct === 5622)).toHaveLength(1);
  });

  it('orden de venta y activación; el rechazo por Lead Time se explica y la OV sigue creada', async () => {
    let lead = true;
    const { svc } = armar({
      escribir: (paso) => {
        if (paso === 'encabezado') return { ok: true, data: { ok: true, codigoInterno: 13391, numeroPF: '11599' } };
        if (paso === 'activar' && lead) return { ok: false, error: 'BUSINESS_ERROR: No existe Lead Time Production para la pelicula FCH--0030TN, el area de planeación debe incluirlo.' };
        return { ok: true, data: { ok: true } };
      },
    });
    const p = await svc.crear({ ...ENTRADA, lineas: [{ referencia: 'FCH--0030TN0400T0570', kilos: 1000, precio: 2.5 }] }, 'Hernán');
    await expect(svc.activar(String(p.id), 'Hernán')).rejects.toThrow(/sin orden de venta/);
    const conOV = await svc.crearOV(String(p.id), 'Hernán');
    expect(conOV.estado).toBe('ov_creada');
    const sinActivar = await svc.activar(String(p.id), 'Hernán');
    expect(sinActivar.estado).toBe('ov_creada');
    expect(sinActivar.error).toMatch(/Planeación no tiene cargado el tiempo de producción \(Lead Time\) de la película FCH--0030TN/);
    lead = false;
    expect((await svc.activar(String(p.id), 'Hernán')).estado).toBe('activa');
  });

  it('si Oben no responde a tiempo queda "revisar" y no se repite sin verificar en OBEN MAS', async () => {
    const { svc, llamadas } = armar({ escribir: () => ({ ok: false, error: 'This operation was aborted' }) });
    const p = await svc.crear(ENTRADA, 'Hernán');
    expect(p.estado).toBe('revisar');
    expect(p.error).toMatch(/Puede haberse creado: búscalo en OBEN MAS/);
    await expect(svc.reintentar(String(p.id), 'Hernán')).rejects.toThrow(ConflictException);
    expect(llamadas).toHaveLength(1);
  });
});

describe('respuestas de las escrituras de Oben (200 aunque rechacen)', () => {
  it('encabezado = número de PF; los demás = "OK"; cualquier otro texto es un rechazo', () => {
    // Formato desde el cambio de José (22-oct): código interno + número oficial.
    expect(resultadoEscritura('encabezado', '"CodSec_SalesOrderHeadPF: 13393; Number PF: 11600"')).toEqual({ ok: true, codigoInterno: 13393, numeroPF: '11600' });
    expect(resultadoEscritura('encabezado', 'CodSec_SalesOrderHeadPF: 13393; Number PF: 11600')).toEqual({ ok: true, codigoInterno: 13393, numeroPF: '11600' });
    // Formato anterior (solo el código interno): se acepta, sin número oficial.
    expect(resultadoEscritura('encabezado', 13392)).toEqual({ ok: true, codigoInterno: 13392, numeroPF: null });
    expect(resultadoEscritura('detalle', 'OK')).toEqual({ ok: true });
    // La OV hoy responde "OK" a secas; si Oben agrega su número (como en el encabezado), se toma.
    expect(resultadoEscritura('ov', 'OK')).toEqual({ ok: true });
    expect(resultadoEscritura('ov', '"OK; Number OV: 11400"')).toEqual({ ok: true, ordenVenta: 11400 });
    expect(resultadoEscritura('ov', 'NumberOrderSales: 11401')).toEqual({ ok: true, ordenVenta: 11401 });
    expect(() => resultadoEscritura('ov', 'No se pudo insertar')).toThrow(/BUSINESS_ERROR/);
    expect(() => resultadoEscritura('activar', 'No existe Lead Time Production para la pelicula FCH--0030TN')).toThrow(/BUSINESS_ERROR: No existe Lead Time/);
    expect(() => resultadoEscritura('encabezado', 'OK')).toThrow(/BUSINESS_ERROR/);
  });

  it('explicaciones claras de cada rechazo', () => {
    expect(explicarRechazo('encabezado', 'x', true)).toMatch(/no respondió a tiempo/);
    expect(explicarRechazo('detalle', 'No se encontró Maestro de Empaque', false, 2)).toMatch(/línea 2 .*Maestro de Empaque/);
  });
});
