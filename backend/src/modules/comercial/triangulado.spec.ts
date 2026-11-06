import { ComercialIntakeService } from './comercial-intake.service';
import { COMERCIAL_POR_DEFECTO } from './comercial-config';
import { construirLinea } from './oc-extractor';
import { esPedidoObenUs, fechaCdd, precioParaLinea, preciosTransferencia } from './triangulado';
import { inferirPelicula } from './oc-extractor';

// OC 3019081 de American Packaging (6-nov-2026), reenviada por Alejandra: va dirigida a OBEN US y se entrega en Deerfield, WI.
const ASUNTO = 'RV: *MAKE & SHIP - Deerfield, WI* APC (OBEN US) - PO 3019081 (ET11TN - 1 40HC)';
const CUERPO = [
  'De: Arazely Melendez (Peru) <arazelymelendez@obengroup.com>',
  'Hola Sebas, Por favor tu apoyo ingresando el pedido adjunto para atención en la planta de Colombia.',
  'RDD: 08/01/27',
  'CDD: 08/01/27',
  'De: Weiner, Austin <AWeiner@americanpackaging.com>',
  'Austin Weiner Senior Procurement Analyst | AWeiner@americanpackaging.com American Packaging Corporation 100 APC Way, Columbus, WI 53925',
  '--- image.png (leído con IA) ---',
  'Order Reference | PO 3019081',
  'US$/lb | US$/kg',
  'Oben Grade | Cust Price | Transfer Price | Cust Price | Transfer Price',
  'ET11TN | 1,1065 | 1,051 | 2,4394 | 2,317',
  '--- Purchase Order (Standard).pdf ---',
  'American Packaging Corporation - Roto 751 Shonkoo Way DeForest, WI 53532',
  'BCP Transportation Warehouse',
  '1 Golf Drive',
  'Deerfield, WI 53531',
  'OBEN US, LLC',
  '711 WEST BAY AREA BLVD SUITE 288 WEBSTER, TX 77958',
  'Deliver To:Supplier:',
  '44,260.00 1.10650 40,000.0 FHBD_001 OBEN VIA PACKFILM US, LLC,ET-TN-11 LBSlbs 44 ga ET-TN-11 6 Inch Core Web Width: 38.250',
].join('\n');

describe('pedidos triangulados con OBEN US', () => {
  it('se reconocen por "(OBEN US)" o "OBEN US, LLC"', () => {
    expect(esPedidoObenUs(ASUNTO)).toBe(true);
    expect(esPedidoObenUs('Supplier: OBEN US, LLC')).toBe(true);
    expect(esPedidoObenUs('PI 11829 BAYSHORE (Diversified Contractors) - PO BF103026')).toBe(false);
    expect(esPedidoObenUs('Oben USA no aplica')).toBe(false);
  });

  it('el precio es el Transfer Price en US$/kg del cuadro del correo, no el de la orden', () => {
    expect(preciosTransferencia(CUERPO)).toEqual([{ grado: 'ET11TN', porKg: 2.317, nota: expect.stringContaining('2,317 US$/kg') }]);
  });

  it('con solo US$/lb se convierte a kg (precio lb / 0,453592)', () => {
    const [p] = preciosTransferencia('Oben Grade | Cust Price | Transfer Price\nUS$/lb\nET11TN | 1,1065 | 1,051');
    expect(p.porKg).toBeCloseTo(2.3171, 4);
  });

  it('"ET11TN" corresponde a la línea "44 ga ET-TN-11"; con otra película y varios precios no se adivina', () => {
    const precios = preciosTransferencia(CUERPO);
    expect(precioParaLinea(precios, '44 ga ET-TN-11, 6 Inch Core')?.porKg).toBe(2.317);
    expect(precioParaLinea([...precios, { grado: 'SC25TN', porKg: 2, nota: '' }], 'BOPP ML 15')).toBeNull();
  });

  it('sin cuadro de Transfer Price no hay precio', () => {
    expect(preciosTransferencia('PO 3019081 price 1.10650 /lb')).toEqual([]);
  });
});

describe('precio por libra (pedidos de Estados Unidos)', () => {
  it('una línea en libras pasa el precio a kilo con la misma fórmula que la cantidad', () => {
    const l = construirLinea(1, { textoCliente: 'ET-TN-11', cantidad: 40000, unidad: 'lb', ancho: 38.25, unidadAncho: 'in', precioUnitario: 1.1065, moneda: 'USD' }, []);
    expect(l.kilos).toBe(18143.7);
    expect(l.anchoMm).toBe(972);
    expect(l.conversiones).toEqual(expect.arrayContaining(['40.000 lb → 18.143,7 kg', '38,25 in → 972 mm']));
    expect(l.precioUnitario).toBeCloseTo(2.4394, 4);
    expect(l.conversiones.join(' ')).toMatch(/precio 1\.1065 \/lb → 2\.4394 \/kg/);
  });

  it('en kilos el precio no se toca', () => {
    expect(construirLinea(1, { textoCliente: 'BOPP', cantidad: 1000, unidad: 'kg', precioUnitario: 2.5 }, []).precioUnitario).toBe(2.5);
  });
});

describe('ComercialIntakeService con la OC 3019081 (triangulada con OBEN US)', () => {
  const OBEN_US = { id: 'cli-obenus', name: 'OBEN US, LLC', obenCode: '9995', authorizedDomains: [], isActive: true, finalCustomerInSubject: false, comercialEmail: null };
  const APC = { id: 'cli-apc', name: 'AMERICAN PACKAGING CORPORATION', obenCode: '9919', authorizedDomains: ['americanpackaging.com'], isActive: true, finalCustomerInSubject: false, comercialEmail: null };
  const DESTINOS = [
    { CodSec_Entity: 9995, Pais_Cliente: 'USA', CodSed_CustomerAddress: 365, Target_Customer: 'AMERICAN PACKAGING CORPORATION', Direccion_Destino: '100 APC WAY, COLUMBUS WI 53925, USA' },
    { CodSec_Entity: 9995, Pais_Cliente: 'USA', CodSed_CustomerAddress: 1922, Target_Customer: 'AMERICAN PACKAGING CORPORATION', Direccion_Destino: '1 GOLF DRIVE DEERFIELD, WI 53531 USA' },
    { CodSec_Entity: 9995, Pais_Cliente: 'USA', CodSed_CustomerAddress: 1959, Target_Customer: 'PRINCIPAL', Direccion_Destino: '601 CIEN RD. SUITE 210, KEMAH, TX 77565, USA' },
  ];
  const armar = (opts: { direccionIa?: string | null; obenUsCreado?: boolean } = {}) => {
    const clients = {
      // El dominio del correo original es de American Packaging (cliente directo): NO debe ganar.
      findByEmailDomain: jest.fn(async (d: string) => ({ client: d === 'americanpackaging.com' ? APC : null, ambiguous: false })),
      findByObenCode: jest.fn(async () => (opts.obenUsCreado === false ? null : OBEN_US)),
      identificarPorContenido: jest.fn(async () => null),
      findByNameInText: jest.fn(async () => null),
    };
    const equivalences = { findAll: jest.fn(async () => []) };
    const maestros = {
      maestro: jest.fn(async () => ({ items: DESTINOS, total: DESTINOS.length, simulado: false })),
      peliculas: jest.fn(async () => ['ET---0011TN', 'ET---0012TN', 'ET---0011RT']),
    };
    const lineaIa = { textoCliente: '44 ga ET-TN-11, 6 Inch Core, Web Width: 38.250', codigoCliente: '44 ga ET-TN-11', cantidad: 40000, unidad: 'lb', ancho: 38.25, unidadAncho: 'in', precioUnitario: 1.1065, moneda: 'USD' };
    const ia = {
      completarJson: jest.fn(async () => JSON.stringify({ numero: '3019081', fechaRequerida: '2027-08-01', direccionEntrega: opts.direccionIa === undefined ? 'BCP Transportation Warehouse, 1 Golf Drive, Deerfield, WI 53531' : opts.direccionIa, lineas: [lineaIa] })),
      leerDocumento: jest.fn(async () => null),
    };
    return new ComercialIntakeService({ call: jest.fn() } as never, clients as never, equivalences as never, maestros as never, ia as never);
  };
  const entrada = { from: 'alejandramolinares@obengroup.com', subject: ASUNTO, body: `De: Weiner, Austin <AWeiner@americanpackaging.com>\n${CUERPO}` };

  it('el cliente es OBEN US (no American Packaging), el destino Deerfield y el precio el Transfer Price', async () => {
    const c = await armar().construir(entrada, COMERCIAL_POR_DEFECTO);
    expect(c.cliente).toBe('OBEN US, LLC');
    expect(c.codigoClienteOben).toBe('9995');
    expect(c.destino).toMatchObject({ direccionId: '1922', fuente: 'orden_compra' });
    expect(c.lineas![0]).toMatchObject({ codigoOben: 'ET---0011TN', precioUnitario: 2.317, moneda: 'USD', anchoMm: 972, kilos: 18143.7 });
    expect(c.fechaRequerida).toBe('2027-01-08');
    expect(c.atencion!.join(' ')).toMatch(/triangulado con OBEN US/);
    // La película sale de "ET-TN-11" del correo: no queda nada pendiente.
    expect(c.missing).toEqual([]);
  });

  it('sin dirección leída por la IA, el destino se toma de la orden adjunta (no de la firma del correo)', async () => {
    const c = await armar({ direccionIa: null }).construir(entrada, COMERCIAL_POR_DEFECTO);
    expect(c.destino).toMatchObject({ direccionId: '1922' });
  });

  it('si OBEN US no está creado en Clientes lo dice y la orden queda sin cliente (nunca el dueño del dominio)', async () => {
    const c = await armar({ obenUsCreado: false }).construir(entrada, COMERCIAL_POR_DEFECTO);
    expect(c.atencion!.join(' ')).toMatch(/OBEN US, LLC \(código 9995 de OBEN MAS\) no está creado en Clientes/);
    expect(c.clientId).toBeNull();
  });
});

describe('fecha CDD y película de Estados Unidos', () => {
  it('CDD del cuerpo del correo es día/mes/año', () => {
    expect(fechaCdd('RDD: 05/12/26 CDD: 11/12/26')).toBe('2026-12-11');
    expect(fechaCdd('CDD: 08/01/27')).toBe('2027-01-08');
    expect(fechaCdd('sin fecha')).toBeNull();
  });

  it('"ET-TN-11" es la película ET---0011TN (letras, sufijo y espesor)', () => {
    expect(inferirPelicula('44 ga ET-TN-11', ['ET---0011TN', 'ET---0011RT', 'ET---0012TN'])).toBe('ET---0011TN');
    expect(inferirPelicula('44 ga ET-TN-11', ['ET---0012TN'])).toBeNull();
  });
});
