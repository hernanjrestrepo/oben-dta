import { inflateSync } from 'zlib';
import { FacturacionPdfService } from './facturacion-pdf.service';
import type { FacturaElectronica, FacturacionDraft } from './facturacion.types';
import type { LiquidacionDraft } from '../liquidacion/liquidacion.types';

/** Bytes WinAnsi (fuentes estándar de pdfkit) que no coinciden con latin1. */
const WIN_ANSI: Record<number, string> = { 0x96: '–', 0x97: '—', 0x93: '“', 0x94: '”', 0x91: '‘', 0x92: '’' };

/**
 * Texto de un PDF de pdfkit: descomprime los content streams y decodifica las
 * cadenas hex de los operadores TJ. Determinista — pdf-parse (pdf.js 1.x/2.x
 * incluidos) falla de forma intermitente con "bad XRef entry" sobre estos
 * mismos PDFs, que son válidos (offsets de la tabla xref verificados).
 */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const parts: string[] = [];
  const streamStart = /stream\r?\n/g;
  for (let m = streamStart.exec(raw); m; m = streamStart.exec(raw)) {
    const start = m.index + m[0].length;
    let content: string;
    try {
      content = inflateSync(Buffer.from(raw.slice(start, raw.indexOf('endstream', start)), 'latin1')).toString('latin1');
    } catch {
      continue; // no es un content stream comprimido (fuentes, imágenes)
    }
    for (const tj of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      const hex = [...tj[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]).join('');
      parts.push([...Buffer.from(hex, 'hex')].map((b) => WIN_ANSI[b] ?? String.fromCharCode(b)).join(''));
    }
  }
  return parts.join(' ');
}

/** Compara sin espacios: los rótulos largos se parten en varias líneas del PDF. */
const squash = (t: string) => t.replace(/\s+/g, '');

const DRAFT: FacturacionDraft = {
  numberOrderSales: 11187,
  cliente: 'OBEN US, LLC',
  pais: 'USA',
  proforma: '11366',
  ordenCompra: '128408',
  contenedor: 'CONTENEDOR ESTANDAR DE 40 PIES (1190)',
  codigoMaterial: 'ENATM',
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
  header: { puertoEmbarque: 'CARTAGENA - COLOMBIA', puertoArribo: 'DALLAS, TX 75212', paNcm: '3920.20.19', paNaladi: '3920.20.10' },
  headerOrigen: { paNcm: 'oben' },
  totales: { incoterm: 'DDP', flete: 941, otrosGastos: 1787.49, valorPoliza: 1.00053 },
  lines: [{ tipoPelicula: 'ENA--0012TM', kilosTotalUnit: 1.7137, valueSure: 3.18 }],
  sinConfirmar: [],
} as unknown as LiquidacionDraft;

const CUFE_SIM: FacturaElectronica = { invoiceNumber: 'OV11187', cufe: 'abc123', status: 'ACEPTADA', simulated: true, emitidaEn: null };

async function pdfDe(draft: FacturacionDraft, factura: FacturaElectronica | null, liquidacion: LiquidacionDraft | null = LIQ) {
  const { pdf, avisos } = await new FacturacionPdfService().buildFactura({
    draft,
    factura,
    liquidacion,
    trm: { valor: 3341.23, fecha: '2026-09-30' },
  });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  const paginas = (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
  return { text: squash(pdfText(pdf)), paginas, avisos };
}

describe('FacturacionPdfService — formato de la factura electrónica de Oben (FV / FEXP de Facture)', () => {
  it('exportación (FEXP): líneas por material con el precio FOB de la liquidación, observaciones y totales', async () => {
    const { text, paginas } = await pdfDe(DRAFT, null);

    expect(text).toContain(squash('FACTURA  ELECTRÓNICA DE VENTA / ELECTRONIC SALES INVOICE'));
    expect(text).toContain(squash('No BORRADOR'));
    expect(text).toContain(squash('ENA--0012TM0902S0760'));
    expect(text).toContain(squash('1.7137'));
    expect(text).toContain(squash('PF 11366  OV  11187'));
    expect(text).toContain(squash('PA NCM: 3920.20.19 PELICULA DE POLIPROPILENO'));
    expect(text).toContain(squash('TOTAL FLETE / FREIGHT: US$ 941.00'));
    expect(text).toContain(squash('OTROS GASTOS / OTHER EXPENSES'));
    expect(text).toContain(squash('TIPO DE CAMBIO / EXCHANGE RATE: 3341.23'));
    expect(text).toContain(squash('CUENTA:80110002051 - BANCOLOMBIA PANAMA'));
    expect(text).toContain(squash('Representación Gráfica De Factura Electrónica De Venta Exportación'));
    expect(text).toContain(squash('BORRADOR'));
    // Como FastReport: observaciones+subtotal y valor en letras+neto van enteros, cada uno donde quepa (la FEXP3190 los lleva a las páginas 8 y 9).
    expect(paginas).toBe(3);
  });

  it('con CUFE simulado: rótulo "sin validez fiscal" y marca de agua SIMULADO', async () => {
    const { text } = await pdfDe(DRAFT, CUFE_SIM);
    expect(text).toContain(squash('CUFE: abc123 (SIMULADO — sin validez fiscal)'));
    expect(text).toContain(squash('No OV11187'));
    expect(text).toContain('SIMULADO');
  });

  it('con factura y CUFE reales no hay marca de agua ni rótulo de simulación', async () => {
    const { text } = await pdfDe(DRAFT, { ...CUFE_SIM, invoiceNumber: 'FEXP3191', simulated: false });
    expect(text).not.toMatch(/SIMULAD|BORRADOR/);
    expect(text).toContain(squash('CUFE: abc123'));
    expect(text).toContain(squash('No FEXP3191'));
  });

  it('nacional (FV): IVA 19 %, valor en letras en español e inglés, texto legal y "Página 1 de 1"', async () => {
    const nacional: FacturacionDraft = { ...DRAFT, kind: 'nacional_completo', pais: 'Colombia', lines: [{ ...DRAFT.lines[0], precio: 10000 }] };
    const { text } = await pdfDe(nacional, null, null);
    expect(text).toContain(squash('FACTURA ELECTRÓNICA DE VENTA / ELECTRONIC SALES INVOICE  No'));
    expect(text).toContain(squash('I.V.A. 19.00%  COP / TAXES'));
    expect(text).toContain(squash('SON:'));
    expect(text).toContain(squash('ARE:'));
    expect(text).toContain(squash('ART. 884 DEL CODIGO DE COMERCIO'));
    expect(text).toContain(squash('Página 1 de 1'));
  });

  it('muchas líneas: pagina como FastReport (encabezado en cada hoja y "Página n de N")', async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      codigo: `ENA--0012TM${String(400 + i * 10).padStart(4, '0')}S0760`,
      kilos: 1000 + i,
      bobinas: 2,
    }));
    const { text, paginas } = await pdfDe({ ...DRAFT, empaque: { ...DRAFT.empaque!, items } }, null);
    expect(paginas).toBeGreaterThan(2);
    expect(text).toContain(squash(`Página ${paginas} de ${paginas}`));
    expect(text).toContain(squash('Total Nro Lineas / Total number of lines : 30'));
  });
});
