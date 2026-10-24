import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import ExcelJS from 'exceljs';
import { Resvg } from '@resvg/resvg-js';
import { AlignmentType, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { ALTO_GRAFICA, ANCHO_GRAFICA, graficaSvg, type MiaGrafica, normalizarGrafica } from './mia-graficas';
import { LOGO_OBEN_BLANCO, LOGO_OBEN_GRAFITO, MARCA } from './mia-marca';

/**
 * Documentos que MIA arma a pedido (José, 7-oct: "MIA debe poder generar cualquier formato: PDF, Excel, Word"; Hernán,
 * 23-oct: "con gráficas, tablas e imágenes, con el manual de marca de Oben Group"). El contenido lo arma el modelo con
 * datos de sus herramientas, que ya respetan los permisos del usuario. Marca: naranja #F47735, grafito #56565A,
 * Helvetica (PDF) y Nunito (gráficas en Word/Excel), logo oficial de obengroup.com.
 */
export type MiaFormato = 'pdf' | 'xlsx' | 'docx';

export interface MiaTabla {
  titulo?: string;
  columnas: string[];
  filas: Array<Array<string | number | null>>;
}

export interface MiaIndicador {
  etiqueta: string;
  valor: string;
  detalle?: string;
}

export interface MiaContenido {
  titulo: string;
  subtitulo?: string;
  parrafos?: string[];
  indicadores?: MiaIndicador[];
  graficas?: MiaGrafica[];
  tablas?: MiaTabla[];
}

export const MIA_FORMATOS: Record<MiaFormato, { contentType: string; extension: string; nombre: string }> = {
  pdf: { contentType: 'application/pdf', extension: 'pdf', nombre: 'PDF' },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx', nombre: 'Excel' },
  docx: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx', nombre: 'Word' },
};

const NARANJA = MARCA.naranja.slice(1);
const GRAFITO = MARCA.grafito.slice(1);
const celda = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : String(v));
const fechaLarga = () => new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Bogota' });

/** Fuente de las gráficas en PNG: Nunito normal y negrita (Google Fonts, OFL), incluida porque el servidor no trae fuentes. */
const CARPETA_FUENTES = [join(__dirname, 'fuentes'), join(process.cwd(), 'src', 'modules', 'eva', 'fuentes')].find((d) => existsSync(join(d, 'Nunito-Regular.ttf')));
const FUENTES = CARPETA_FUENTES ? ['Nunito-Regular.ttf', 'Nunito-Bold.ttf'].map((f) => join(CARPETA_FUENTES, f)) : [];

/** SVG → PNG (Word y Excel). `ancho` en píxeles. */
export function svgAPng(svg: string, ancho: number): Buffer {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: ancho },
    background: 'rgba(255,255,255,0)',
    font: { fontFiles: FUENTES, loadSystemFonts: FUENTES.length === 0, defaultFontFamily: 'Nunito', sansSerifFamily: 'Nunito' },
  })
    .render()
    .asPng();
}

export async function generarArchivoMia(formato: MiaFormato, c: MiaContenido): Promise<Buffer> {
  const contenido: MiaContenido = { ...c, graficas: (c.graficas ?? []).map(normalizarGrafica).filter((g) => g.categorias.length && g.series.length) };
  if (formato === 'xlsx') return xlsx(contenido);
  if (formato === 'docx') return docx(contenido);
  return pdf(contenido);
}

async function xlsx(c: MiaContenido): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MIA — Oben Xmart';
  const tablas = c.tablas ?? [];
  const graficas = c.graficas ?? [];
  const ws = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 34;
  ws.getColumn(3).width = 34;
  ws.getColumn(4).width = 34;
  const logo = wb.addImage({ buffer: svgAPng(LOGO_OBEN_GRAFITO, 360) as unknown as ExcelJS.Buffer, extension: 'png' });
  ws.addImage(logo, { tl: { col: 1, row: 0.3 }, ext: { width: 150, height: 69 } });
  ws.getRow(5).values = ['', c.titulo];
  ws.getRow(5).font = { bold: true, size: 18, color: { argb: `FF${NARANJA}` } };
  ws.getRow(6).values = ['', c.subtitulo ?? fechaLarga()];
  ws.getRow(6).font = { size: 11, color: { argb: `FF${GRAFITO}` } };
  let fila = 8;
  if (c.indicadores?.length) {
    c.indicadores.slice(0, 12).forEach((k, i) => {
      const col = 2 + (i % 3);
      const r = fila + Math.floor(i / 3) * 3;
      const et = ws.getCell(r, col);
      et.value = k.etiqueta.toUpperCase();
      et.font = { size: 9, color: { argb: `FF${GRAFITO}` } };
      const v = ws.getCell(r + 1, col);
      v.value = k.valor;
      v.font = { bold: true, size: 16, color: { argb: `FF${NARANJA}` } };
      for (const cell of [et, v]) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F1F1' } };
    });
    fila += Math.ceil(Math.min(c.indicadores.length, 12) / 3) * 3 + 1;
  }
  for (const p of c.parrafos ?? []) {
    const cell = ws.getCell(fila, 2);
    cell.value = p;
    cell.alignment = { wrapText: true, vertical: 'top' };
    ws.mergeCells(fila, 2, fila, 4);
    ws.getRow(fila).height = Math.min(400, 15 * Math.ceil(p.length / 110));
    fila += 1;
  }
  if (graficas.length) {
    const wg = wb.addWorksheet('Gráficas', { views: [{ showGridLines: false }] });
    graficas.forEach((g, i) => {
      const img = wb.addImage({ buffer: svgAPng(graficaSvg(g), 1440) as unknown as ExcelJS.Buffer, extension: 'png' });
      wg.addImage(img, { tl: { col: 0.3, row: 1 + i * 22 }, ext: { width: ANCHO_GRAFICA, height: ALTO_GRAFICA } });
    });
  }
  tablas.forEach((t, i) => {
    const wt = wb.addWorksheet((t.titulo || `Tabla ${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    const header = wt.addRow(t.columnas);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NARANJA}` } }));
    t.filas.forEach((f, j) => {
      const row = wt.addRow(f.map((v) => (v === null ? '' : v)));
      if (j % 2 === 1) row.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } }));
    });
    t.columnas.forEach((col, j) => {
      const largo = Math.max(col.length, ...t.filas.map((f) => celda(f[j]).length));
      wt.getColumn(j + 1).width = Math.min(60, Math.max(10, largo + 2));
    });
    wt.views = [{ state: 'frozen', ySplit: 1 }];
    wt.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, t.columnas.length) } };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function docx(c: MiaContenido): Promise<Buffer> {
  const hijos: Array<Paragraph | Table> = [];
  hijos.push(new Paragraph({ children: [new TextRun({ text: c.titulo, bold: true, size: 40, color: NARANJA, font: 'Helvetica' })], spacing: { after: 60 } }));
  hijos.push(new Paragraph({ children: [new TextRun({ text: c.subtitulo ?? fechaLarga(), size: 22, color: GRAFITO, font: 'Helvetica' })], spacing: { after: 240 } }));
  if (c.indicadores?.length) {
    const ind = c.indicadores.slice(0, 12);
    const filas: TableRow[] = [];
    for (let i = 0; i < ind.length; i += 3) {
      filas.push(
        new TableRow({
          children: ind.slice(i, i + 3).map(
            (k) =>
              new TableCell({
                shading: { type: ShadingType.CLEAR, fill: 'F1F1F1', color: 'auto' },
                margins: { top: 120, bottom: 120, left: 160, right: 160 },
                children: [
                  new Paragraph({ children: [new TextRun({ text: k.etiqueta.toUpperCase(), size: 16, color: GRAFITO, font: 'Helvetica' })] }),
                  new Paragraph({ children: [new TextRun({ text: k.valor, bold: true, size: 32, color: NARANJA, font: 'Helvetica' })] }),
                  ...(k.detalle ? [new Paragraph({ children: [new TextRun({ text: k.detalle, size: 16, color: GRAFITO, font: 'Helvetica' })] })] : []),
                ],
              }),
          ),
        }),
      );
    }
    hijos.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: filas }));
    hijos.push(new Paragraph({ text: '' }));
  }
  for (const p of c.parrafos ?? []) hijos.push(new Paragraph({ children: [new TextRun({ text: p, font: 'Helvetica', size: 21 })], spacing: { after: 140 } }));
  for (const g of c.graficas ?? []) {
    hijos.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 160 },
        children: [new ImageRun({ type: 'png', data: svgAPng(graficaSvg(g), 1440), transformation: { width: 600, height: Math.round((600 * ALTO_GRAFICA) / ANCHO_GRAFICA) } })],
      }),
    );
  }
  for (const t of c.tablas ?? []) {
    if (t.titulo) hijos.push(new Paragraph({ text: t.titulo, heading: HeadingLevel.HEADING_2 }));
    const fila = (valores: Array<string | number | null>, encabezado = false, par = false) =>
      new TableRow({
        tableHeader: encabezado,
        children: valores.map(
          (v) =>
            new TableCell({
              shading: encabezado ? { type: ShadingType.CLEAR, fill: NARANJA, color: 'auto' } : par ? { type: ShadingType.CLEAR, fill: 'F7F7F7', color: 'auto' } : undefined,
              children: [new Paragraph({ children: [new TextRun({ text: celda(v), bold: encabezado, size: 18, font: 'Helvetica', color: encabezado ? 'FFFFFF' : undefined })] })],
            }),
        ),
      });
    hijos.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [fila(t.columnas, true), ...t.filas.map((f, i) => fila(f, false, i % 2 === 1))] }));
    hijos.push(new Paragraph({ text: '' }));
  }
  const logo = svgAPng(LOGO_OBEN_GRAFITO, 480);
  return Packer.toBuffer(
    new Document({
      creator: 'MIA — Oben Xmart',
      title: c.titulo,
      sections: [
        {
          headers: { default: new Header({ children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 110, height: 50 } })] })] }) },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({ text: 'Oben Xmart · MIA — página ', size: 16, color: '888888', font: 'Helvetica' }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '888888', font: 'Helvetica' }),
                    new TextRun({ text: ' de ', size: 16, color: '888888', font: 'Helvetica' }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '888888', font: 'Helvetica' }),
                  ],
                }),
              ],
            }),
          },
          children: hijos,
        },
      ],
    }),
  );
}

const M = 48;

function pdf(c: MiaContenido): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: M, bottom: M + 14, left: M, right: M }, bufferPages: true, info: { Title: c.titulo, Author: 'MIA — Oben Xmart' } });
    const partes: Buffer[] = [];
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    const ancho = doc.page.width - 2 * M;
    const limite = () => doc.page.height - M - 14;

    // Portada: franja grafito con el logo blanco de Oben Group y el título.
    doc.rect(0, 0, doc.page.width, 118).fill(MARCA.grafito);
    doc.rect(0, 118, doc.page.width, 4).fill(MARCA.naranja);
    SVGtoPDF(doc, LOGO_OBEN_BLANCO, M, 26, { width: 140, height: 64, preserveAspectRatio: 'xMinYMid meet' });
    doc.font('Helvetica').fontSize(9).fillColor('#FFFFFF').text('Oben Xmart · MIA', M, 48, { width: ancho, align: 'right' });
    doc.text(fechaLarga(), M, 62, { width: ancho, align: 'right' });
    doc.y = 146;
    doc.font('Helvetica-Bold').fontSize(22).fillColor(MARCA.negro).text(c.titulo, M, doc.y, { width: ancho });
    if (c.subtitulo) doc.moveDown(0.2).font('Helvetica').fontSize(11).fillColor(MARCA.grafito).text(c.subtitulo, { width: ancho });
    doc.moveDown(0.8);

    // Indicadores: tarjetas de 3 por fila.
    if (c.indicadores?.length) {
      const ind = c.indicadores.slice(0, 12);
      const w = (ancho - 2 * 10) / 3;
      for (let i = 0; i < ind.length; i += 3) {
        if (doc.y + 62 > limite()) doc.addPage();
        const y = doc.y;
        ind.slice(i, i + 3).forEach((k, j) => {
          const x = M + j * (w + 10);
          doc.roundedRect(x, y, w, 56, 6).fill(MARCA.grisClaro);
          doc.rect(x, y, 3, 56).fill(MARCA.naranja);
          doc.font('Helvetica').fontSize(7.5).fillColor(MARCA.grafito).text(k.etiqueta.toUpperCase(), x + 12, y + 9, { width: w - 20, lineBreak: false, ellipsis: true });
          doc.font('Helvetica-Bold').fontSize(16).fillColor(MARCA.naranja).text(k.valor, x + 12, y + 21, { width: w - 20, lineBreak: false, ellipsis: true });
          if (k.detalle) doc.font('Helvetica').fontSize(7.5).fillColor(MARCA.grafito).text(k.detalle, x + 12, y + 41, { width: w - 20, lineBreak: false, ellipsis: true });
        });
        doc.x = M;
        doc.y = y + 66;
      }
      doc.moveDown(0.4);
    }

    doc.font('Helvetica').fontSize(10).fillColor(MARCA.negro);
    for (const p of c.parrafos ?? []) {
      if (doc.y + 30 > limite()) doc.addPage();
      doc.font('Helvetica').fontSize(10).fillColor(MARCA.negro).text(p, M, doc.y, { width: ancho, lineGap: 2 }).moveDown(0.5);
    }

    // Gráficas: vector (nítidas a cualquier zoom).
    for (const g of c.graficas ?? []) {
      const alto = (ancho * ALTO_GRAFICA) / ANCHO_GRAFICA;
      if (doc.y + alto + 10 > limite()) doc.addPage();
      const y = doc.y + 4;
      SVGtoPDF(doc, graficaSvg(g), M, y, { width: ancho, height: alto });
      doc.roundedRect(M - 1, y - 1, ancho + 2, alto + 2, 6).lineWidth(0.6).strokeColor('#E2E2E3').stroke();
      doc.x = M;
      doc.y = y + alto + 14;
    }

    for (const t of c.tablas ?? []) {
      doc.moveDown(0.4);
      if (doc.y + 50 > limite()) doc.addPage();
      if (t.titulo) {
        doc.font('Helvetica-Bold').fontSize(12).fillColor(MARCA.negro).text(t.titulo, M, doc.y, { width: ancho });
        doc.rect(M, doc.y + 2, 28, 2.5).fill(MARCA.naranja);
        doc.moveDown(0.5);
      }
      const n = Math.max(1, t.columnas.length);
      const w = ancho / n;
      const numerica = t.columnas.map((_, j) => t.filas.length > 0 && t.filas.every((f) => f[j] === null || typeof f[j] === 'number'));
      const filaPdf = (valores: Array<string | number | null>, encabezado: boolean, par: boolean) => {
        doc.font(encabezado ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
        const alto = Math.max(14, ...valores.map((v) => doc.heightOfString(celda(v), { width: w - 8 }))) + 6;
        if (doc.y + alto + 8 > limite()) {
          doc.addPage();
          if (!encabezado) filaPdf(t.columnas, true, false);
          doc.font(encabezado ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
        }
        const y = doc.y;
        if (encabezado) doc.rect(M, y, ancho, alto).fill(MARCA.naranja);
        else if (par) doc.rect(M, y, ancho, alto).fill('#F7F7F7');
        valores.forEach((v, j) => {
          doc.fillColor(encabezado ? '#FFFFFF' : MARCA.negro).text(celda(v), M + j * w + 4, y + 4, { width: w - 8, align: numerica[j] ? 'right' : 'left' });
        });
        doc.x = M;
        doc.y = y + alto;
      };
      filaPdf(t.columnas, true, false);
      t.filas.forEach((f, i) => filaPdf(f, false, i % 2 === 1));
    }

    // Pie en todas las páginas: línea naranja, "Oben Xmart · MIA" y "página i de n".
    const rango = doc.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i++) {
      doc.switchToPage(i);
      // Sin margen inferior mientras se escribe el pie: si no, PDFKit abre una página nueva por escribir "debajo".
      doc.page.margins.bottom = 0;
      const y = doc.page.height - M + 6;
      doc.rect(M, y - 6, ancho, 1).fill(MARCA.naranja);
      doc.font('Helvetica').fontSize(8).fillColor('#888888');
      doc.text('Oben Xmart · Generado por MIA', M, y, { width: ancho / 2, lineBreak: false });
      doc.text(`Página ${i - rango.start + 1} de ${rango.count}`, M + ancho / 2, y, { width: ancho / 2, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

/**
 * Archivos generados en memoria hasta que el usuario los descarga (1 hora).
 * Solo los descarga quien los pidió.
 */
export class MiaArchivosStore {
  private static readonly TTL_MS = 60 * 60_000;
  private static readonly MAX = 100;
  private readonly archivos = new Map<string, { userId: string; nombre: string; contentType: string; buffer: Buffer; expira: number }>();

  guardar(userId: string, nombre: string, contentType: string, buffer: Buffer): string {
    this.limpiar();
    while (this.archivos.size >= MiaArchivosStore.MAX) this.archivos.delete(this.archivos.keys().next().value as string);
    const id = randomUUID();
    this.archivos.set(id, { userId, nombre, contentType, buffer, expira: Date.now() + MiaArchivosStore.TTL_MS });
    return id;
  }

  obtener(id: string, userId: string): { nombre: string; contentType: string; buffer: Buffer } | null {
    this.limpiar();
    const a = this.archivos.get(id);
    return a && a.userId === userId ? a : null;
  }

  private limpiar(): void {
    const ahora = Date.now();
    for (const [id, a] of this.archivos) if (a.expira < ahora) this.archivos.delete(id);
  }
}

export const MIA_ARCHIVOS = new MiaArchivosStore();
