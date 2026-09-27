import { inflateSync } from 'zlib';
import { CUFE_SIMULADO_LABEL, FacturacionPdfService } from './facturacion-pdf.service';
import type { FacturaElectronica, FacturacionDraft } from './facturacion.types';

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
  numberOrderSales: 11086,
  cliente: 'OBEN US, LLC',
  pais: 'USA',
  proforma: '11271',
  ordenCompra: '128353',
  contenedor: 'CONT1',
  codigoMaterial: 'SC15TN',
  kind: 'exportacion',
  direccionEntrega: 'Bodega 3, USA',
  direccionFuente: 'oben_plus',
  observaciones: null,
  infoComercial: null,
  lines: [{ codSecLineFilm: 113, tipoPelicula: 'ENA--0012TM', precio: 2.827, kilosTotal: 1339.42, valorLinea: 3786.54 }],
  totalValor: 3786.54,
  totalKilos: 1339.42,
  missing: [],
  readyToGenerate: true,
  simulated: true,
  simulatedFields: ['direccionEntrega'],
};
const CUFE_SIM: FacturaElectronica = { invoiceNumber: 'OV11086', cufe: 'abc123', status: 'ACEPTADA', simulated: true, emitidaEn: null };

async function textOf(draft: FacturacionDraft, factura: FacturaElectronica | null): Promise<string> {
  const pdf = await new FacturacionPdfService().build(draft, factura);
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  return squash(pdfText(pdf));
}

describe('FacturacionPdfService — rótulos de datos simulados', () => {
  it('CUFE y dirección simulados: recuadro inicial, rótulo junto a cada dato y pie sin validez fiscal', async () => {
    const text = await textOf(DRAFT, CUFE_SIM);

    expect(text).toContain(squash('DOCUMENTO CON DATOS SIMULADOS'));
    expect(text).toContain(squash(CUFE_SIMULADO_LABEL));
    expect(text).toContain(squash('abc123'));
    expect(text).toContain(squash('(SIMULADA — Oben+)'));
    expect(text).toContain(squash('no tiene validez fiscal'));
  });

  it('sin emisión todavía (descarga antes de enviar): "Pendiente de emisión" y sin rótulo de CUFE', async () => {
    const text = await textOf({ ...DRAFT, simulated: false, simulatedFields: [], direccionFuente: 'digitada' }, null);

    expect(text).toContain(squash('Pendiente de emisión'));
    expect(text).toContain(squash('Factura electrónica aún no emitida'));
    expect(text).not.toContain(squash('DATOS SIMULADOS'));
    expect(text).not.toContain(squash(CUFE_SIMULADO_LABEL));
  });

  it('con datos y CUFE reales no aparece ningún rótulo de simulación', async () => {
    const text = await textOf(
      { ...DRAFT, simulated: false, simulatedFields: [], direccionFuente: 'digitada' },
      { ...CUFE_SIM, simulated: false },
    );

    expect(text).not.toMatch(/SIMULAD/);
    expect(text).toContain(squash('Factura electrónica OV11086, CUFE abc123'));
  });
});
