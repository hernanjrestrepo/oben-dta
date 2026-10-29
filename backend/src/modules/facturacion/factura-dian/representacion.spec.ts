import { PARTIDAS } from '../../liquidacion/partidas-arancelarias';
import type { FacturacionDraft } from '../facturacion.types';
import type { LiquidacionDraft } from '../../liquidacion/liquidacion.types';
import { ciudadDeDireccion, construirFacturaDian, descripcionMaterial, descripcionNcm, fechaEmisionTxt, monedaNacional, usaTrmDeOrdenCompra } from './representacion';

const DRAFT: FacturacionDraft = {
  numberOrderSales: 11187,
  cliente: 'OBEN US, LLC',
  pais: 'USA',
  proforma: '11366',
  ordenCompra: '128408',
  contenedor: null,
  codigoMaterial: null,
  kind: 'exportacion',
  direccionEntrega: '2144 FRENCH SETTLEMENT RD, Dallas TX 75212, USA',
  direccionFuente: 'oben_erp',
  observaciones: null,
  infoComercial: null,
  lines: [{ codSecLineFilm: 113, tipoPelicula: 'ENA--0012TM', precio: 2.827, kilosTotal: 2453.3, valorLinea: 6935.48 }],
  empaque: {
    pallets: 4,
    bobinas: 7,
    pesoNetoKg: 2453.3,
    pesoBrutoKg: 2604.1,
    items: [
      { codigo: 'ENA--0012TM0902S0760', kilos: 1226.65, bobinas: 4 },
      { codigo: 'ENA--0012TM1050S0760', kilos: 1226.65, bobinas: 3 },
    ],
  },
  totalValor: 6935.48,
  totalKilos: 2453.3,
  missing: [],
  readyToGenerate: true,
  simulated: false,
  simulatedFields: [],
};
const LIQ = {
  incoterm: 'DDP',
  header: { puertoEmbarque: 'CARTAGENA - COLOMBIA', puertoArribo: 'DALLAS, TX 75212', paNcm: '3920.62.00', paNaladi: '3920.62.00' },
  headerOrigen: { paNcm: 'provisional' },
  totales: { incoterm: 'DDP', flete: 941, otrosGastos: 1787.49, valorPoliza: 1.00053 },
  lines: [{ tipoPelicula: 'ENA--0012TM', kilosTotalUnit: 1.7137, valueSure: 3.18 }],
  sinConfirmar: ['x'],
} as unknown as LiquidacionDraft;
const AHORA = new Date('2026-10-01T22:36:00Z');

describe('construirFacturaDian', () => {
  it('exportación: precio FOB de la liquidación por material, + flete + seguro + otros = neto (como la FEXP3190)', () => {
    const { factura: f, avisos } = construirFacturaDian({ draft: DRAFT, factura: null, liquidacion: LIQ, trm: { valor: 3341.23, fecha: '2026-10-01' }, ahora: AHORA });
    expect(f.tipo).toBe('exportacion');
    expect(f.lineas.map((l) => [l.codigo, l.cantidad, l.valorUnitario, l.ivaPct, l.total])).toEqual([
      ['ENA--0012TM0902S0760', 1226.65, 1.7137, 0, 2102.11],
      ['ENA--0012TM1050S0760', 1226.65, 1.7137, 0, 2102.11],
    ]);
    expect(f.subtotal).toBe(4204.22);
    expect([f.flete, f.seguro, f.otrosGastos]).toEqual([941, 3.18, 1787.49]);
    expect(f.neto).toBe(6935.89);
    expect(f.valorLetras).toBe('SON: SEIS MIL NOVECIENTOS TREINTA Y CINCO DOLARES CON OCHENTA Y NUEVE CENTAVOS');
    expect(f.valorLetrasIngles).toBeNull();
    expect(f.incoterm).toBe('DDP');
    expect(f.tipoCambio).toBe(3341.23);
    expect(f.fechaEmision).toBe('2026-10-01 05:36 PM');
    expect(f.cliente.ciudad).toBe('Dallas');
    expect(f.marcaAgua).toBe('BORRADOR');
    expect(f.observaciones).toEqual(
      expect.arrayContaining([
        'PF 11366  OV  11187',
        'PESO NETO / NET WEIGHT: 2453.3 KG',
        'PALETAS / PALLETS: 4',
        'BOBINAS / ROLLS: 7',
        'TOTAL FOB: US$ 4,204.22',
        'TOTAL OTROS GASTOS / OTHER EXPENSES: US$ 1,787.49',
        // En una sola línea (María, 20-oct).
        'TOTAL VALOR DDP DALLAS, TX 75212 INCOTERM 2020 US$ 6,935.89',
        'PUERTO DE ORIGEN / ORIGEM: CARTAGENA - COLOMBIA',
      ]),
    );
    // QR en pesos (USD × TRM), como el de Facture.
    expect(f.qr).toContain(`ValFac: ${(4204.22 * 3341.23).toFixed(2)}`);
    expect(f.qr).toContain('NitFac: 901046830');
    expect(avisos.join(' ')).toMatch(/PROVISIONAL/);
    expect(avisos.join(' ')).toMatch(/sin confirmar/);
  });

  it('PA NCM con la partida de Colombia (Parida) lleva la descripción del tipo que entrega Oben (Linea/TipoMaterial)', () => {
    const liq = {
      ...LIQ,
      header: { ...LIQ.header, paNcm: '39.20.10.90', paNaladi: '3920.20.10' },
      headerOrigen: { paNcm: 'oben' },
      partidaTipo: PARTIDAS.bopp,
    } as unknown as LiquidacionDraft;
    const { factura: f } = construirFacturaDian({ draft: DRAFT, factura: null, liquidacion: liq, trm: { valor: 3341.23, fecha: '2026-10-01' }, ahora: AHORA });
    expect(f.observaciones).toContain('PA NCM: 39.20.10.90 PELICULA DE POLIPROPILENO BIORIENTADO // 39.20.10.90 BIORIENTED POLYPROPYLENE FILM');
  });

  it('sin liquidación: precio negociado, flete y seguro en 0, con aviso', () => {
    const { factura: f, avisos } = construirFacturaDian({ draft: DRAFT, factura: null, liquidacion: null, ahora: AHORA });
    expect(f.lineas[0].valorUnitario).toBe(2.827);
    expect([f.flete, f.seguro]).toEqual([0, 0]);
    expect(avisos.join(' ')).toMatch(/Sin liquidación/);
  });

  it('nacional: IVA 19 %, neto = subtotal + IVA − retefuente, valor también en inglés', () => {
    const nacional: FacturacionDraft = {
      ...DRAFT,
      kind: 'nacional_completo',
      pais: 'Colombia',
      empaque: null,
      lines: [{ ...DRAFT.lines[0], precio: 10000, kilosTotal: 100 }],
    };
    const { factura: f } = construirFacturaDian({ draft: nacional, factura: null, ahora: new Date('2026-07-27T21:35:17Z') });
    expect(f.tipo).toBe('nacional');
    expect(f.lineas[0]).toMatchObject({ cantidad: 100, valorUnitario: 10000, ivaPct: 19, ivaValor: 190000, total: 1000000 });
    expect([f.subtotal, f.iva, f.neto]).toEqual([1000000, 190000, 1190000]);
    expect(f.valorLetras).toBe('SON: UN MILLON CIENTO NOVENTA MIL PESOS');
    expect(f.valorLetrasIngles).toBe('ARE:  ONE MILLION ONE HUNDRED NINETY THOUSAND PESOS');
    expect(f.fechaEmision).toBe('2026-07-27 16:35:17-05:00');
    // José (29-oct): en nacionales las observaciones llevan en letras cada subtotal (en pesos, sin retefuente en 0).
    expect(f.observaciones.filter((o) => /COP/.test(o))).toEqual([
      'SUBTOTAL 1000000.0000 COP - UN MILLON CON 00/100 COP',
      'IVA 190000.0000 COP - CIENTO NOVENTA MIL CON 00/100 COP',
      'TOTAL 1190000.0000 COP - UN MILLON  CIENTO NOVENTA MIL CON 00/100 COP',
    ]);
  });

  it('nacional en dólares (precio por kilo de Oben 2.60, OV 11402): USD, TRM y totales en pesos en observaciones; sin Incoterm', () => {
    const nacional: FacturacionDraft = {
      ...DRAFT,
      kind: 'nacional_completo',
      pais: 'Colombia',
      empaque: null,
      observaciones: null,
      lines: [{ ...DRAFT.lines[0], precio: 2.6, kilosTotal: 1000 }],
    };
    const { factura: f } = construirFacturaDian({ draft: nacional, factura: null, trm: { valor: 4000, fecha: '2026-10-21' }, ahora: new Date('2026-10-21T16:00:00Z') });
    expect(f.moneda).toBe('USD');
    expect(f.tipoCambio).toBe(4000);
    expect(f.incoterm).toBeNull();
    expect([f.subtotal, f.iva, f.neto]).toEqual([2600, 494, 3094]);
    expect(f.valorLetras).toMatch(/DOLARES$/);
    expect(f.observaciones).toEqual([
      expect.stringMatching(/^SUBTOTAL 10400000\.0000 COP - .* CON 00\/100 COP$/),
      expect.stringMatching(/^IVA 1976000\.0000 COP - /),
      expect.stringMatching(/^TOTAL 12376000\.0000 COP - /),
    ]);
    expect(f.observaciones.join(' ')).not.toMatch(/NCM|INCOTERM|PUERTO|EXPORT/);
  });

  it('moneda nacional: precios en miles por kilo = COP; sin TRM un pedido en USD avisa', () => {
    expect(monedaNacional([10000, 9800])).toEqual({ moneda: 'COP', aviso: null });
    expect(monedaNacional([2.6, 2.48])).toEqual({ moneda: 'USD', aviso: null });
    expect(monedaNacional([2.6, 9800]).aviso).toMatch(/escalas distintas/);
    const nacional: FacturacionDraft = { ...DRAFT, kind: 'nacional_completo', pais: 'Colombia', empaque: null, lines: [{ ...DRAFT.lines[0], precio: 2.6, kilosTotal: 10 }] };
    expect(construirFacturaDian({ draft: nacional, factura: null }).avisos.join(' ')).toMatch(/sin TRM/);
  });

  it('PPC FLEX factura con la TRM de su orden de compra: con ella, totales en pesos; sin ella, aviso y nada inventado', () => {
    expect(usaTrmDeOrdenCompra('PPC FLEX S.A.S.')).toBe(true);
    expect(usaTrmDeOrdenCompra('PPC FLEXI')).toBe(true);
    expect(usaTrmDeOrdenCompra('POLIEMPAK SAS')).toBe(false);
    const ppc: FacturacionDraft = { ...DRAFT, kind: 'nacional_completo', pais: 'Colombia', cliente: 'PPC FLEX S.A.S.', ordenCompra: 'OC-77', empaque: null, observaciones: null, lines: [{ ...DRAFT.lines[0], precio: 2.6, kilosTotal: 1000 }] };
    const sin = construirFacturaDian({ draft: ppc, factura: null, trm: null, trmDeOrdenCompra: true });
    expect(sin.factura.tipoCambio).toBeNull();
    expect(sin.factura.observaciones).toEqual([]);
    expect(sin.avisos.join(' ')).toMatch(/TRM de su orden de compra \(OC OC-77\)/);
    const con = construirFacturaDian({ draft: ppc, factura: null, trm: { valor: 3900, fecha: 'orden de compra' }, trmDeOrdenCompra: true });
    expect(con.factura.tipoCambio).toBe(3900);
    expect(con.factura.observaciones[0]).toMatch(/^SUBTOTAL 10140000\.0000 COP/);
  });

  it('marca de agua: BORRADOR sin emisión, SIMULADO con CUFE simulado, ninguna con factura real', () => {
    const real = { invoiceNumber: 'FEXP3191', cufe: 'c', status: 'ok', simulated: false, emitidaEn: null };
    expect(construirFacturaDian({ draft: DRAFT, factura: null }).factura.marcaAgua).toBe('BORRADOR');
    expect(construirFacturaDian({ draft: DRAFT, factura: { ...real, simulated: true } }).factura.marcaAgua).toBe('SIMULADO');
    expect(construirFacturaDian({ draft: { ...DRAFT, simulated: true }, factura: real }).factura.marcaAgua).toBe('SIMULADO');
    expect(construirFacturaDian({ draft: DRAFT, factura: real }).factura.marcaAgua).toBeNull();
  });
});

describe('ayudas de formato', () => {
  it('descripción desde el código de material (lo que no está en el código no se inventa)', () => {
    expect(descripcionMaterial('SC---0030TN0405S0760')).toBe('OPP SEAL FILM SC30 TN X 405 MM Diámetro 760');
    expect(descripcionMaterial('ENA--0012TM0902S0760')).toBe('ENA12 TM X 902 MM Diámetro 760');
    expect(descripcionMaterial('7709990480344')).toBe('7709990480344');
  });

  it('ciudad desde la dirección de Oben', () => {
    expect(ciudadDeDireccion('2144 FRENCH SETTLEMENT RD, Dallas TX 75212, USA')).toBe('Dallas');
    expect(ciudadDeDireccion('CARRERA 16 # 22-10')).toBeNull();
  });

  it('fechas con el formato de cada tipo de factura (hora de Colombia)', () => {
    const d = new Date('2026-09-30T22:36:36Z');
    expect(fechaEmisionTxt('exportacion', d)).toBe('2026-09-30 05:36 PM');
    expect(fechaEmisionTxt('nacional', d)).toBe('2026-09-30 17:36:36-05:00');
  });
});

describe('descripcionNcm (DescripcionSKU de Oben, 16-oct)', () => {
  it('parte el texto de Oben en español // NCM inglés', () => {
    expect(descripcionNcm('39.20.20.90.00', 'PELÍCULA DE POLIPROPILENO BIORIENTADA / BIAXIALLY ORIENTED POLYPROPYLENE FILM', null)).toBe(
      ' PELÍCULA DE POLIPROPILENO BIORIENTADA // 39.20.20.90.00 BIAXIALLY ORIENTED POLYPROPYLENE FILM',
    );
  });
  it('sin DescripcionSKU usa la tabla de partidas; sin nada, vacío', () => {
    expect(descripcionNcm('3920.20.19', null, { descripcionEs: 'ES', descripcionEn: 'EN' } as never)).toBe(' ES // 3920.20.19 EN');
    expect(descripcionNcm('3920.20.19', null, null)).toBe('');
  });
});

describe('factura de exportación = liquidación exacta (reunión de pruebas con COMEX, 20-oct)', () => {
  // PF 11166 / OV 10999 (Videplast, CFR Puerto Itapoa), datos reales de producción del 20-oct.
  const ITEMS: Array<[string, number]> = [
    ['ET---0012RT0890S0760', 2853.12],
    ['ET---0012RT0910S0760', 3982.94],
    ['ET---0012RT0960S0760', 3149],
    ['ET---0012RT1000S0760', 3358.62],
    ['ET---0012RT1110S0760', 2965.65],
    ['ET---0012RT1150S0760', 3073.25],
    ['ET---0012RT1190S0760', 3254.35],
  ];
  const draft11166: FacturacionDraft = {
    ...DRAFT,
    numberOrderSales: 10999,
    cliente: 'VIDEPLAST INDUSTRIA DE EMBALAGENS LTDA',
    pais: 'Brasil',
    proforma: '11166',
    ordenCompra: '7700003576',
    lines: [{ codSecLineFilm: 1, tipoPelicula: 'ET---0012RT', precio: 2.7, kilosTotal: 22636.93, valorLinea: 61119.71 }],
    empaque: { pallets: 34, bobinas: 41, pesoNetoKg: 22636.93, pesoBrutoKg: 24187.1, items: ITEMS.map(([codigo, kilos]) => ({ codigo, kilos, bobinas: 1 })) },
    totalValor: 61119.71,
    totalKilos: 22636.93,
  };
  const liq11166 = (extra: Partial<LiquidacionDraft> = {}) =>
    ({
      incoterm: 'CFR',
      header: { puertoEmbarque: 'CARTAGENA - COLOMBIA', puertoArribo: 'PUERTO ITAPOA', paNcm: '3920620010', paNaladi: '3920.62.00' },
      headerOrigen: { paNcm: 'oben' },
      totales: { incoterm: 'CFR', flete: 324, valorPoliza: 1.00053 },
      lines: [{ tipoPelicula: 'ET---0012RT', kilosTotal: 22636.93, kilosTotalUnit: 2.6857, valueFOB: 60796, valueFreight: 324, valueSure: 0, expensesOther: 0 }],
      sinConfirmar: [],
      descripcionSku: 'PELÍCULA DE POLIÉSTER BIORIENTADA / BIAXIALLY ORIENTED POLYESTER FILM',
      terminoPago: '30 DAYS FROM INVOICE DATE',
      ...extra,
    }) as unknown as LiquidacionDraft;

  it('PF 11166: FOB 60,796.00 + flete 324 = 61,120.00 cerrado (antes 60,796.01 / 61,120.01): el centavo se ajusta en el último rollo', () => {
    const { factura: f } = construirFacturaDian({ draft: draft11166, factura: null, liquidacion: liq11166(), ahora: AHORA });
    expect(f.subtotal).toBe(60796);
    expect(f.neto).toBe(61120);
    // Precio unitario de 4 decimales en todos los rollos; solo el último absorbe el centavo.
    expect(f.lineas.every((l) => l.valorUnitario === 2.6857)).toBe(true);
    expect(f.lineas.slice(0, -1).map((l) => l.total)).toEqual([7662.62, 10696.98, 8457.27, 9020.25, 7964.85, 8253.83]);
    expect(f.lineas.at(-1)!.total).toBe(8740.2);
    expect(f.observaciones).toContain('TOTAL FOB: US$ 60,796.00');
    expect(f.observaciones).toContain('TOTAL VALOR CFR PUERTO ITAPOA INCOTERM 2020 US$ 61,120.00');
    expect(f.observaciones.some((o) => o.trim().startsWith('INCOTERM 2020'))).toBe(false); // ya no en otro renglón
    expect(f.valorLetras).toContain('SESENTA Y UN MIL CIENTO VEINTE DOLARES');
  });

  it('el término de pago de la proforma (TerminoPago de Oben) va en la factura', () => {
    const { factura: f, avisos } = construirFacturaDian({ draft: draft11166, factura: null, liquidacion: liq11166(), ahora: AHORA });
    expect(f.terminosPago).toBe('30 DAYS FROM INVOICE DATE');
    expect(avisos.join(' ')).not.toMatch(/término de pago|Forma de pago/i);
    const sin = construirFacturaDian({ draft: draft11166, factura: null, liquidacion: liq11166({ terminoPago: null }), ahora: AHORA });
    expect(sin.factura.terminosPago).toBeNull();
    expect(sin.avisos.join(' ')).toMatch(/no trajo el término de pago/);
  });

  it('si los kilos de la Lista de Empaque no coinciden con los liquidados no se fuerza nada: se avisa', () => {
    const otro = { ...draft11166, empaque: { ...draft11166.empaque!, items: draft11166.empaque!.items.slice(1) } };
    const { factura: f, avisos } = construirFacturaDian({ draft: otro, factura: null, liquidacion: liq11166(), ahora: AHORA });
    expect(avisos.join(' ')).toMatch(/no coinciden con los liquidados/);
    expect(f.subtotal).not.toBe(60796);
  });

  it('junto a la partida: la descripción de Oben, un texto propio del cliente o nada', () => {
    const ncm = (liq: LiquidacionDraft) => construirFacturaDian({ draft: draft11166, factura: null, liquidacion: liq, ahora: AHORA }).factura.observaciones.find((o) => o.startsWith('PA NCM'));
    expect(ncm(liq11166())).toBe('PA NCM: 3920620010 PELÍCULA DE POLIÉSTER BIORIENTADA // 3920620010 BIAXIALLY ORIENTED POLYESTER FILM');
    const propio = liq11166({ header: { ...liq11166().header, paNcm: '3920.62.19' }, factura: { ncmDescripcion: 'PELICULA DE POLIETILENO TEREFTALATO', ncmConDescripcion: true, ncmDescripcionPorDefecto: null, origen: 'cliente' } });
    expect(ncm(propio)).toBe('PA NCM: 3920.62.19 PELICULA DE POLIETILENO TEREFTALATO');
    const sola = liq11166({ factura: { ncmDescripcion: null, ncmConDescripcion: false, ncmDescripcionPorDefecto: null, origen: 'usuario' } });
    expect(ncm(sola)).toBe('PA NCM: 3920620010');
  });
});
