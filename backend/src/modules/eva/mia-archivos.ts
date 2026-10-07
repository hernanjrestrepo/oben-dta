import { randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';

/**
 * Documentos que MIA arma a pedido (José, 7-oct: "MIA debe poder generar
 * cualquier formato: PDF, Excel, Word"). El contenido lo arma el modelo con
 * datos de sus herramientas, que ya respetan los permisos del usuario.
 */
export type MiaFormato = 'pdf' | 'xlsx' | 'docx';

export interface MiaTabla {
  titulo?: string;
  columnas: string[];
  filas: Array<Array<string | number | null>>;
}

export interface MiaContenido {
  titulo: string;
  parrafos?: string[];
  tablas?: MiaTabla[];
}

export const MIA_FORMATOS: Record<MiaFormato, { contentType: string; extension: string; nombre: string }> = {
  pdf: { contentType: 'application/pdf', extension: 'pdf', nombre: 'PDF' },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx', nombre: 'Excel' },
  docx: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx', nombre: 'Word' },
};

const NARANJA = 'F47735';
const celda = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));

export async function generarArchivoMia(formato: MiaFormato, c: MiaContenido): Promise<Buffer> {
  if (formato === 'xlsx') return xlsx(c);
  if (formato === 'docx') return docx(c);
  return pdf(c);
}

async function xlsx(c: MiaContenido): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MIA — Oben Xmart';
  const tablas = c.tablas ?? [];
  if (c.parrafos?.length || tablas.length === 0) {
    const ws = wb.addWorksheet('Resumen');
    ws.addRow([c.titulo]).font = { bold: true, size: 14 };
    for (const p of c.parrafos ?? []) ws.addRow([p]);
    ws.getColumn(1).width = 100;
  }
  tablas.forEach((t, i) => {
    const ws = wb.addWorksheet((t.titulo || `Tabla ${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    const header = ws.addRow(t.columnas);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NARANJA}` } }));
    for (const f of t.filas) ws.addRow(f.map((v) => (v === null ? '' : v)));
    t.columnas.forEach((col, j) => {
      const largo = Math.max(col.length, ...t.filas.map((f) => celda(f[j]).length));
      ws.getColumn(j + 1).width = Math.min(60, Math.max(10, largo + 2));
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function docx(c: MiaContenido): Promise<Buffer> {
  const hijos: Array<Paragraph | Table> = [new Paragraph({ text: c.titulo, heading: HeadingLevel.HEADING_1 })];
  for (const p of c.parrafos ?? []) hijos.push(new Paragraph({ children: [new TextRun(p)], spacing: { after: 120 } }));
  for (const t of c.tablas ?? []) {
    if (t.titulo) hijos.push(new Paragraph({ text: t.titulo, heading: HeadingLevel.HEADING_2 }));
    const fila = (valores: Array<string | number | null>, encabezado = false) =>
      new TableRow({
        tableHeader: encabezado,
        children: valores.map(
          (v) =>
            new TableCell({
              shading: encabezado ? { fill: NARANJA } : undefined,
              children: [new Paragraph({ children: [new TextRun({ text: celda(v), bold: encabezado, color: encabezado ? 'FFFFFF' : undefined })] })],
            }),
        ),
      });
    hijos.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [fila(t.columnas, true), ...t.filas.map((f) => fila(f))] }));
    hijos.push(new Paragraph({ text: '' }));
  }
  hijos.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Generado por MIA — Oben Xmart', italics: true, size: 16, color: '888888' })] }));
  return Packer.toBuffer(new Document({ creator: 'MIA — Oben Xmart', title: c.titulo, sections: [{ children: hijos }] }));
}

function pdf(c: MiaContenido): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
    const partes: Buffer[] = [];
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    const ancho = doc.page.width - 96;
    doc.fillColor(`#${NARANJA}`).font('Helvetica-Bold').fontSize(16).text(c.titulo, { width: ancho });
    doc.moveDown(0.6).fillColor('#111111').font('Helvetica').fontSize(10);
    for (const p of c.parrafos ?? []) doc.text(p, { width: ancho }).moveDown(0.4);
    for (const t of c.tablas ?? []) {
      doc.moveDown(0.4);
      if (t.titulo) doc.font('Helvetica-Bold').fontSize(11).text(t.titulo, { width: ancho }).moveDown(0.2);
      const n = Math.max(1, t.columnas.length);
      const w = ancho / n;
      const filaPdf = (valores: Array<string | number | null>, encabezado: boolean) => {
        doc.font(encabezado ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
        const alto = Math.max(...valores.map((v) => doc.heightOfString(celda(v), { width: w - 6 }))) + 6;
        if (doc.y + alto > doc.page.height - 48) doc.addPage();
        const y = doc.y;
        if (encabezado) doc.rect(48, y, ancho, alto).fill(`#${NARANJA}`);
        valores.forEach((v, j) => {
          doc.fillColor(encabezado ? '#FFFFFF' : '#111111').text(celda(v), 48 + j * w + 3, y + 3, { width: w - 6 });
        });
        doc.moveTo(48, y + alto).lineTo(48 + ancho, y + alto).strokeColor('#DDDDDD').lineWidth(0.5).stroke();
        doc.x = 48;
        doc.y = y + alto;
      };
      filaPdf(t.columnas, true);
      for (const f of t.filas) filaPdf(f, false);
    }
    doc.moveDown(1).font('Helvetica-Oblique').fontSize(8).fillColor('#888888').text('Generado por MIA — Oben Xmart', 48, doc.y, { width: ancho, align: 'right' });
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
