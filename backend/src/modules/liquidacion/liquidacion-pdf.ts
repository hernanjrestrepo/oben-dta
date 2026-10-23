import PDFDocument from 'pdfkit';
import type { LiquidacionDraft } from './liquidacion.types';

/**
 * PDFs del correo "Se realizó revisión de liquidación de COMEX" (Hernán, 23-oct): la Proforma y la Liquidación,
 * armadas con los datos reales de Oben (spCheckSettlement: cliente, OC, puertos, Incoterm, término de pago, kilos y
 * precio por línea) y los valores que COMEX aprobó. No son el PDF oficial de OBEN MAS (Oben no lo expone por API):
 * lo dicen en el pie.
 */

const MARGEN = 36;
const NARANJA = '#F47735';
const GRIS = '#555555';

const num = (v: unknown, dec = 2): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';
const usd = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `US$ ${num(v)}` : '—');

function documento(landscape: boolean): { doc: PDFKit.PDFDocument; listo: Promise<Buffer> } {
  const doc = new PDFDocument({ size: 'letter', layout: landscape ? 'landscape' : 'portrait', margin: MARGEN });
  const partes: Buffer[] = [];
  doc.on('data', (c: Buffer) => partes.push(c));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
  return { doc, listo };
}

function encabezado(doc: PDFKit.PDFDocument, titulo: string, subtitulo: string) {
  doc.font('Helvetica-Bold').fontSize(18).fillColor(NARANJA).text('oben', MARGEN, MARGEN, { continued: true });
  doc.font('Helvetica').fontSize(8).fillColor(GRIS).text('  Holding Group');
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(titulo);
  doc.font('Helvetica').fontSize(9).fillColor(GRIS).text(subtitulo);
  doc.moveDown(0.6);
}

/** Pares etiqueta/valor en dos columnas. */
function datos(doc: PDFKit.PDFDocument, pares: Array<[string, string | null | undefined]>) {
  const ancho = (doc.page.width - MARGEN * 2) / 2;
  const filas = Math.ceil(pares.length / 2);
  const y0 = doc.y;
  let maxY = y0;
  pares.forEach(([k, v], i) => {
    const col = i < filas ? 0 : 1;
    const fila = i < filas ? i : i - filas;
    const x = MARGEN + col * ancho;
    const y = y0 + fila * 26;
    doc.font('Helvetica').fontSize(7).fillColor(GRIS).text(k.toUpperCase(), x, y, { width: ancho - 10 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text(v?.trim() || '—', x, y + 9, { width: ancho - 10, height: 16, ellipsis: true });
    maxY = Math.max(maxY, y + 26);
  });
  doc.x = MARGEN;
  doc.y = maxY + 6;
}

interface Columna {
  titulo: string;
  ancho: number;
  derecha?: boolean;
}

function tabla(doc: PDFKit.PDFDocument, columnas: Columna[], filas: string[][], total?: string[]) {
  const dibujarFila = (celdas: string[], negrita: boolean, fondo?: string) => {
    const alto = 18;
    if (doc.y + alto > doc.page.height - MARGEN - 30) doc.addPage();
    const y = doc.y;
    if (fondo) doc.rect(MARGEN, y, columnas.reduce((s, c) => s + c.ancho, 0), alto).fill(fondo);
    let x = MARGEN;
    celdas.forEach((t, i) => {
      const c = columnas[i];
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor('#111111').text(t, x + 3, y + 5, { width: c.ancho - 6, align: c.derecha ? 'right' : 'left', height: 10, ellipsis: true });
      x += c.ancho;
    });
    doc.x = MARGEN;
    doc.y = y + alto;
  };
  dibujarFila(columnas.map((c) => c.titulo), true, '#F3F4F6');
  filas.forEach((f) => dibujarFila(f, false));
  if (total) dibujarFila(total, true, '#FFF4ED');
}

function pie(doc: PDFKit.PDFDocument, texto: string) {
  doc.moveDown(1);
  doc.font('Helvetica').fontSize(7).fillColor(GRIS).text(texto, MARGEN, doc.y, { width: doc.page.width - MARGEN * 2 });
}

const kilosDe = (d: LiquidacionDraft) => d.lines.reduce((s, l) => s + (l.kilosTotal ?? 0), 0);
const descripcion = (l: LiquidacionDraft['lines'][number]) => (l.descripcion?.split('/')[0].trim() || l.tipoPelicula);

/** Proforma con los datos de Oben (precios y kilos de la PF). */
export async function pdfProforma(d: LiquidacionDraft): Promise<Buffer> {
  const { doc, listo } = documento(false);
  encabezado(doc, `Proforma ${d.numberPF}`, `${d.cliente}${d.pais ? ` · ${d.pais}` : ''}`);
  datos(doc, [
    ['Proforma', d.numberPF],
    ['Orden de venta', d.ordenVenta],
    ['Orden de compra del cliente', d.ordenCompra],
    ['Término de pago', d.terminoPago ?? null],
    ['Incoterm', d.incoterm],
    ['Cliente', d.cliente],
    ['Dirección', d.header.direccion ?? null],
    ['Puerto de embarque', d.header.puertoEmbarque ?? null],
    ['Puerto de arribo', d.header.puertoArribo ?? null],
    ['Partida arancelaria', d.header.paNcm ?? null],
  ]);
  const ancho = doc.page.width - MARGEN * 2;
  const cols: Columna[] = [
    { titulo: 'Producto', ancho: ancho * 0.42 },
    { titulo: 'Tipo', ancho: ancho * 0.14 },
    { titulo: 'Kilos', ancho: ancho * 0.14, derecha: true },
    { titulo: 'Precio / kg', ancho: ancho * 0.12, derecha: true },
    { titulo: 'Valor (USD)', ancho: ancho * 0.18, derecha: true },
  ];
  const total = d.lines.reduce((s, l) => s + (l.kilosTotal ?? 0) * l.precio, 0);
  tabla(
    doc,
    cols,
    d.lines.map((l) => [descripcion(l), l.tipoPelicula, num(l.kilosTotal), num(l.precio, 4), num((l.kilosTotal ?? 0) * l.precio)]),
    ['Total', '', num(kilosDe(d)), '', num(total)],
  );
  pie(doc, 'Generada por Oben Xmart con los datos de la proforma en OBEN MAS (precios y kilos de Oben). No reemplaza el documento oficial de OBEN MAS.');
  doc.end();
  return listo;
}

/** Liquidación de exportación tal como la aprobó COMEX. */
export async function pdfLiquidacion(d: LiquidacionDraft, aprobacion: { por: string | null; en: Date }): Promise<Buffer> {
  const { doc, listo } = documento(true);
  encabezado(
    doc,
    `Liquidación de exportación · PF ${d.numberPF}`,
    `Revisada y aprobada por COMEX${aprobacion.por ? ` (${aprobacion.por})` : ''} el ${aprobacion.en.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  );
  const h = d.header;
  const t = d.totales;
  const fob = d.lines.reduce((s, l) => s + (l.valueFOB ?? 0), 0);
  const flete = d.lines.reduce((s, l) => s + (l.valueFreight ?? 0), 0);
  const seguro = d.lines.reduce((s, l) => s + (l.valueSure ?? 0), 0);
  const otros = d.lines.reduce((s, l) => s + (l.expensesOther ?? 0), 0);
  datos(doc, [
    ['Cliente', `${d.cliente}${d.pais ? ` · ${d.pais}` : ''}`],
    ['Orden de venta / OC', `${d.ordenVenta} / ${d.ordenCompra}`],
    ['Incoterm', d.incoterm],
    ['Término de pago', d.terminoPago ?? null],
    ['Ruta', `${h.puertoEmbarque ?? '—'} → ${h.puertoArribo ?? '—'}`],
    ['FOB final', usd(fob)],
    ['Flete', usd(t.flete ?? flete)],
    ['Seguro', usd(seguro)],
    ['Otros gastos', usd(t.otrosGastos ?? otros)],
    [`Total ${d.incoterm ?? ''}`.trim(), usd(fob + flete + seguro + otros)],
  ]);
  if (d.esUSA) {
    datos(doc, [
      ['Inland', usd(h.inlandFreight)],
      ['Entry Fee', usd(h.entryFee)],
      ['ISF', usd(h.importerSecurityFiling)],
      ['HMF', usd(h.harborMaintenanceFee)],
    ]);
  }
  const ancho = doc.page.width - MARGEN * 2;
  const p = (f: number) => ancho * f;
  const cols: Columna[] = [
    { titulo: 'Producto', ancho: p(0.22) },
    { titulo: 'Kilos', ancho: p(0.09), derecha: true },
    { titulo: 'Precio/kg', ancho: p(0.08), derecha: true },
    { titulo: 'Valor total', ancho: p(0.1), derecha: true },
    { titulo: 'Flete', ancho: p(0.1), derecha: true },
    { titulo: 'Seguro', ancho: p(0.09), derecha: true },
    { titulo: 'Otros', ancho: p(0.09), derecha: true },
    { titulo: 'FOB final', ancho: p(0.12), derecha: true },
    { titulo: 'Precio final/kg', ancho: p(0.11), derecha: true },
  ];
  tabla(
    doc,
    cols,
    d.lines.map((l) => [
      descripcion(l),
      num(l.kilosTotal),
      num(l.precio, 4),
      num(l.valueTotal),
      num(l.valueFreight),
      num(l.valueSure),
      num(l.expensesOther),
      num(l.valueFOB),
      l.kilosTotal ? num((l.valueFOB ?? 0) / l.kilosTotal, 4) : '—',
    ]),
    ['Total', num(kilosDe(d)), '', num(d.lines.reduce((s, l) => s + (l.valueTotal ?? 0), 0)), num(flete), num(seguro), num(otros), num(fob), ''],
  );
  const ajustes = d.ajustes.filter((a) => !/^Ajuste automático/i.test(a)).slice(0, 8);
  if (ajustes.length) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111').text('Notas del cálculo', MARGEN);
    ajustes.forEach((a) => doc.font('Helvetica').fontSize(7).fillColor(GRIS).text(`• ${a}`, { width: ancho }));
  }
  pie(doc, 'Generada por Oben Xmart con los datos de Oben y los valores aprobados por COMEX.');
  doc.end();
  return listo;
}
