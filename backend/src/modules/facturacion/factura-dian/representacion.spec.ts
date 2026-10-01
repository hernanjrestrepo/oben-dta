import type { FacturacionDraft } from '../facturacion.types';
import type { LiquidacionDraft } from '../../liquidacion/liquidacion.types';
import { ciudadDeDireccion, construirFacturaDian, descripcionMaterial, fechaEmisionTxt } from './representacion';

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
        'TOTAL VALOR DDP DALLAS, TX 75212 -',
        ' INCOTERM 2020 US$ 6,935.89',
        'PUERTO DE ORIGEN / ORIGEM: CARTAGENA - COLOMBIA',
      ]),
    );
    // QR en pesos (USD × TRM), como el de Facture.
    expect(f.qr).toContain(`ValFac: ${(4204.22 * 3341.23).toFixed(2)}`);
    expect(f.qr).toContain('NitFac: 901046830');
    expect(avisos.join(' ')).toMatch(/PROVISIONAL/);
    expect(avisos.join(' ')).toMatch(/sin confirmar/);
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
