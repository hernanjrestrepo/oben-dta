import { armarProformaDocumento, decodificarSku, descripcionLinea } from './proforma-documento';
import { proformaPdf } from './proforma-pdf';

// Datos REALES leídos de Oben el 28-oct para la PF 11562 (reporte COMEX, Lista de Empaque de la OV 11371 y la
// liquidación que María vio en pantalla): el ítem 1 del documento de OBEN MAS es 2.932,13 kg de ET---0010QN0750S0760.
const REPORTE = {
  NroProforma: '11562',
  Mercado: 'EXPORTACION',
  Cliente: 'CAPITAL TRADE IMPORTACAO E EXPORTACAO LTDA',
  Pais: 'BRASIL',
  Incoterms: 'CIF',
  OrdenesVenta: [
    { NroOrdenVenta: '11371', DetalleSKU: [{ SKU: 'ET---0010QN0750S0760', Cantidad: 2932.13 }, { SKU: 'ET---0010QN0775S0760', Cantidad: 865.68 }, { SKU: 'ET---0010QN0800S0760', Cantidad: 5361.6 }] },
    { NroOrdenVenta: '11372', DetalleSKU: [{ SKU: 'ET---0010QN0895S0760', Cantidad: 7997.76 }, { SKU: 'ET---0012QN1115S0760', Cantidad: 622.73 }] },
  ],
};
const CHECK = {
  campos: {
    Proforma: '11562',
    OrdenVenta: '11371/11372',
    OrdenCompra: 'OECT15292/26 - PO 1181',
    Cliente: 'CAPITAL TRADE IMPORTACAO E EXPORTACAO LTDA',
    Direccion: 'RUA DOUTOR PEDRO FERREIRA, 333 EDIF ABSOLUTE BUSINESS - ITAJAÍ/SC - BRASIL CEP: 88301-030 CNPJ 07.872.326/0001-58',
    PuertoEmbarque: 'CARTAGENA - COLOMBIA',
    PuertoArribo: 'PUERTO ITAPOA',
    Incoterms: 'CIF',
    TerminoPago: '90 DAYS FROM DATE OF BL',
    Pais: 'BRASIL',
  },
  detalle: [
    { TipoPelicula: 'ET---0010QN', Precio: 2.7, KilosTotales: 44020.42, Partida: '3920620090' },
    { TipoPelicula: 'ET---0012QN', Precio: 2.5, KilosTotales: 613.01, Partida: '3920620090' },
  ],
};
const EMPAQUE = [
  {
    ov: 11371,
    cliente: 'CAPITAL TRADE IMPORTACAO E EXPORTACAO LTDA',
    ordenCompra: 'OECT15292/26 - PO 1181',
    contenedor: 'CONTENEDOR ESTANDAR DE 40 PIES (1190)',
    pais: 'BRASIL',
    pallets: 32,
    skus: [{ sku: 'ET---0010QN0750S0760', rollos: 7, kilosNetos: 2859.48 }],
  },
];

describe('Proforma con el formato de OBEN MAS (María Escobar, 28-oct)', () => {
  it('decodifica el SKU: película, micras, ancho, core y diámetro', () => {
    expect(decodificarSku('ET---0010QN0750S0760')).toEqual({ familia: 'ET', micras: 10, tipo: 'QN', anchoMm: 750, coreLetra: 'S', diametroMm: 760 });
    expect(decodificarSku('SC---0015TN0610S0760')).toMatchObject({ familia: 'SC', micras: 15, anchoMm: 610 });
    expect(decodificarSku('EMq--0012TM/ET---0012RT')).toBeNull();
  });

  it('la descripción sale como en el documento: "OPET PLAIN FILM ET10 QN X 750 MM Core 6 Diámetro 760"', () => {
    expect(descripcionLinea('ET---0010QN0750S0760')).toEqual({ descripcion: 'OPET PLAIN FILM ET10 QN X 750 MM Core 6 Diámetro 760', diametroMm: 760, core: '6' });
  });

  it('con liquidación vigente: ítem 1 = 2.932,13 kg, 7 rollos, P.A. 3920620090, US$2,70 por kg; total = kilos × precio', () => {
    const d = armarProformaDocumento({ numberPF: '11562', check: CHECK, copiaDe: null, reporte: REPORTE, empaque: EMPAQUE, direccionCliente: null });
    const l1 = d.lineas.find((l) => l.sku === 'ET---0010QN0750S0760')!;
    expect(l1).toMatchObject({ kilos: 2932.13, rollos: 7, diametroMm: 760, core: '6', partida: '3920620090', precio: 2.7, total: 7916.75 });
    expect(l1.descripcion).toBe('OPET PLAIN FILM ET10 QN X 750 MM Core 6 Diámetro 760');
    expect(d.lineas).toHaveLength(5);
    expect(d.lineas.find((l) => l.sku === 'ET---0012QN1115S0760')).toMatchObject({ precio: 2.5 }); // otra película, otro precio
    expect(d).toMatchObject({
      ordenCompra: 'OECT15292/26 - PO 1181',
      ordenesVenta: ['11371', '11372'],
      mercado: 'EXPORTACION',
      incoterm: 'CIF',
      formaPago: '90 DAYS FROM DATE OF BL',
      desde: 'CARTAGENA - COLOMBIA',
      hasta: 'PUERTO ITAPOA',
      puertoDestino: 'ITAPOA',
      embalaje: 'IN PALLETS',
      fuenteLiquidacion: 'vivo',
    });
    expect(d.vendidoA.direccion).toContain('RUA DOUTOR PEDRO FERREIRA');
    expect(d.totalKilos).toBeCloseTo(17779.9, 1);
    expect(d.totalUsd).toBeCloseTo(d.lineas.reduce((a, l) => a + (l.total ?? 0), 0), 2);
  });

  it('lo que ninguna fuente entrega NO se inventa: consignado, fechas y contenedores quedan como no disponibles', () => {
    const d = armarProformaDocumento({ numberPF: '11562', check: CHECK, copiaDe: null, reporte: REPORTE, empaque: [], direccionCliente: null });
    expect(d.consignadoA).toBeNull();
    expect(d.fechas).toEqual({ proforma: null, estimadaEmbarque: null, estimadaEntrega: null, requeridaCliente: null });
    expect(d.contenedores).toBeNull();
    expect(d.faltantes).toEqual(expect.arrayContaining(['Consignado a', 'Contenedores']));
  });

  it('proforma ya liquidada y sin copia: las cantidades salen del reporte, el precio queda en blanco y se explica', () => {
    const d = armarProformaDocumento({ numberPF: '11562', check: null, copiaDe: null, reporte: REPORTE, empaque: EMPAQUE, direccionCliente: 'RUA DOUTOR PEDRO FERREIRA, 333 - ITAJAÍ/SC' });
    expect(d.fuenteLiquidacion).toBe('sin_liquidacion');
    expect(d.lineas[0]).toMatchObject({ kilos: 2932.13, precio: null, total: null, partida: null });
    expect(d.totalUsd).toBeNull();
    expect(d.vendidoA.direccion).toBe('RUA DOUTOR PEDRO FERREIRA, 333 - ITAJAÍ/SC'); // del maestro de clientes
    expect(d.faltantes.join(' ')).toMatch(/Precio unitario/);
  });

  it('con copia guardada: usa precio y partida de la copia y dice de cuándo es', () => {
    const d = armarProformaDocumento({ numberPF: '11562', check: CHECK, copiaDe: '2026-10-28T12:18:00.000Z', reporte: REPORTE, empaque: EMPAQUE, direccionCliente: null });
    expect(d.fuenteLiquidacion).toBe('copia');
    expect(d.copiaDe).toBe('2026-10-28T12:18:00.000Z');
    expect(d.lineas[0].precio).toBe(2.7);
  });

  it('sin reporte se arma con los kilos empacados de la Lista de Empaque y lo avisa', () => {
    const d = armarProformaDocumento({ numberPF: '11562', check: CHECK, copiaDe: null, reporte: null, empaque: EMPAQUE, direccionCliente: null });
    expect(d.lineas).toHaveLength(1);
    expect(d.lineas[0].kilos).toBe(2859.48);
    expect(d.faltantes.join(' ')).toMatch(/Cantidades pedidas/);
  });

  it('el PDF se genera (formato apaisado de una página) con y sin precios', async () => {
    const conPrecio = await proformaPdf(armarProformaDocumento({ numberPF: '11562', check: CHECK, copiaDe: null, reporte: REPORTE, empaque: EMPAQUE, direccionCliente: null }));
    expect(conPrecio.subarray(0, 4).toString()).toBe('%PDF');
    expect(conPrecio.length).toBeGreaterThan(3000);
    const sinPrecio = await proformaPdf(armarProformaDocumento({ numberPF: '11562', check: null, copiaDe: null, reporte: REPORTE, empaque: [], direccionCliente: null }));
    expect(sinPrecio.subarray(0, 4).toString()).toBe('%PDF');
    if (process.env.GUARDAR_PDF_PRUEBA) require('fs').writeFileSync(process.env.GUARDAR_PDF_PRUEBA, conPrecio);
  });
});
