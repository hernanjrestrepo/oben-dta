import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { OBEN_LOGO_BASE64 } from '../oben-reports/oben-logo';
import type { FacturaElectronica, FacturacionDraft, FacturacionKind } from './facturacion.types';

const PAGE_W = 612; // letter, points
const PAGE_H = 792;
const M = 40;
const CONTENT_W = PAGE_W - M * 2;
/** Espacio reservado al pie en cada página. */
const FOOTER_H = 58;

const ORANGE = '#F47735';
const INK = '#1F2937';
const MUTED = '#6B7280';
const LINE = '#E5E7EB';
const SOFT = '#FFF4ED';

const KIND_LABEL: Record<FacturacionKind, string> = {
  exportacion: 'Pedido de Exportación',
  nacional_completo: 'Pedido Nacional — Despacho Completo',
  nacional_parcial: 'Pedido Nacional — Despacho Parcial',
};

/** Rótulo obligatorio mientras el CUFE salga del simulador DIAN. */
export const CUFE_SIMULADO_LABEL = 'CUFE SIMULADO — pendiente de proveedor DIAN real';

const num = (n: number, min = 2, max = 2) => n.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });

type Doc = PDFKit.PDFDocument;

/**
 * Documento de apoyo para Facturación/COMEX armado con datos reales
 * (Empaque Unificada + Check Settlement) según los 3 flujos descritos en
 * `Business/OBEN MAS - PARADIXE.pdf`. Todo dato SIMULADO (CUFE del simulador
 * DIAN, dirección tomada de Oben+ simulado) se rotula como tal en un recuadro
 * al inicio, junto al propio dato, en una marca de agua y en el pie — nadie
 * debe poder tomarlo como el documento fiscal final.
 */
@Injectable()
export class FacturacionPdfService {
  async build(draft: FacturacionDraft, facturaElectronica: FacturaElectronica | null = null): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'letter',
      margins: { top: M, left: M, right: M, bottom: FOOTER_H + 12 },
      bufferPages: true,
      info: { Title: `Borrador de facturación — OV ${draft.numberOrderSales}`, Author: 'Oben Xmart', Subject: draft.cliente },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const simulado = !!facturaElectronica?.simulated || draft.simulated;
    this.watermark(doc, simulado);
    doc.on('pageAdded', () => {
      this.watermark(doc, simulado);
      doc.rect(0, 0, PAGE_W, 5).fill(ORANGE);
      doc.x = M;
      doc.y = M;
    });

    this.renderHeader(doc, draft);
    this.renderSimulationBanner(doc, draft, facturaElectronica);
    this.renderInfo(doc, draft, facturaElectronica);
    this.renderLines(doc, draft);
    this.renderNotes(doc, draft);
    this.renderFooters(doc, facturaElectronica);

    doc.end();
    return done;
  }

  /** Marca de agua tenue: "BORRADOR", o "SIMULADO" si algún dato lo es. */
  private watermark(doc: Doc, simulado: boolean): void {
    const { x, y } = doc;
    doc.save();
    doc.rotate(-32, { origin: [PAGE_W / 2, PAGE_H / 2] });
    doc
      .font('Helvetica-Bold')
      .fontSize(92)
      .fillColor(simulado ? '#DC2626' : '#9CA3AF')
      .fillOpacity(0.06)
      .text(simulado ? 'SIMULADO' : 'BORRADOR', 0, PAGE_H / 2 - 50, { width: PAGE_W, align: 'center', lineBreak: false });
    doc.restore();
    doc.fillOpacity(1);
    doc.x = x;
    doc.y = y;
  }

  private renderHeader(doc: Doc, draft: FacturacionDraft): void {
    doc.rect(0, 0, PAGE_W, 5).fill(ORANGE);
    doc.image(Buffer.from(OBEN_LOGO_BASE64, 'base64'), M, 24, { height: 34 });
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text('OBEN COLOMBIA S.A.S.\nWWW.OBENGROUP.COM\nTEL. (57) 1 7467700\nGALAPA - COLOMBIA', M + CONTENT_W - 200, 25, { width: 200, align: 'right' });

    const top = 78;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('BORRADOR DE FACTURACIÓN', M, top, { width: 340 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(ORANGE)
      .text(draft.kind ? KIND_LABEL[draft.kind] : 'Tipo de pedido sin clasificar (falta el país)', M, top + 24, { width: 340 });

    const bx = M + CONTENT_W - 170;
    doc.roundedRect(bx, top - 2, 170, 48, 6).fillAndStroke(SOFT, '#FBD5BF');
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text('ORDEN DE VENTA', bx + 12, top + 6, { width: 146, characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(17).fillColor(INK).text(String(draft.numberOrderSales), bx + 12, top + 16, { width: 146 });
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(MUTED)
      .text(`Generado ${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}`, bx + 12, top + 35, { width: 146 });

    doc.y = top + 62;
  }

  private renderSimulationBanner(doc: Doc, draft: FacturacionDraft, factura: FacturaElectronica | null): void {
    const avisos: string[] = [];
    if (factura?.simulated) avisos.push(`${CUFE_SIMULADO_LABEL}.`);
    if (draft.simulatedFields.includes('direccionEntrega')) {
      avisos.push('Dirección de entrega SIMULADA (Oben+ aún no tiene API real).');
    }
    if (draft.simulatedFields.includes('pedido') || draft.simulatedFields.includes('precios')) {
      avisos.push('Datos del pedido y precios SIMULADOS (Oben en modo simulador).');
    }
    if (avisos.length === 0) return;
    const text = `DOCUMENTO CON DATOS SIMULADOS — ${avisos.join(' ')}`;
    doc.font('Helvetica-Bold').fontSize(8.5);
    const h = doc.heightOfString(text, { width: CONTENT_W - 24 }) + 16;
    const y = doc.y;
    doc.roundedRect(M, y, CONTENT_W, h, 6).fillAndStroke('#FEF2F2', '#FCA5A5');
    doc.fillColor('#B91C1C').text(text, M + 12, y + 8, { width: CONTENT_W - 24, align: 'center' });
    doc.y = y + h + 12;
  }

  /** Dos tarjetas: cliente/pedido y entrega/factura electrónica (misma altura). */
  private renderInfo(doc: Doc, draft: FacturacionDraft, factura: FacturaElectronica | null): void {
    const direccion = draft.direccionEntrega
      ? `${draft.direccionEntrega}${draft.simulatedFields.includes('direccionEntrega') ? ' (SIMULADA — Oben+)' : ''}`
      : '— (sin definir)';
    const facturaElectronica = factura
      ? `${factura.invoiceNumber} — CUFE ${factura.cufe}${factura.simulated ? ` (${CUFE_SIMULADO_LABEL})` : ''}`
      : 'Pendiente de emisión (se emite al enviar a COMEX)';

    const gap = 12;
    const cardW = (CONTENT_W - gap) / 2;
    const inner = cardW - 24;
    const half = (inner - 12) / 2;
    const left: Array<[string, string]> = [
      ['Cliente', draft.cliente],
      ['País', draft.pais ?? '—'],
      ['Proforma', draft.proforma ?? '—'],
      ['Orden de compra', draft.ordenCompra ?? '—'],
      ['Contenedor', draft.contenedor ?? '—'],
      ['Código de material', draft.codigoMaterial ?? '—'],
    ];
    const right: Array<[string, string]> = [
      ['Dirección de entrega', direccion],
      ['Factura electrónica', facturaElectronica],
    ];

    // Izquierda: cliente a todo el ancho, el resto en 2 columnas.
    const fieldH = (value: string, width: number) => 11 + this.textHeight(doc, value, 9, width) + 8;
    const leftRows: number[] = [fieldH(left[0][1], inner)];
    for (let i = 1; i < left.length; i += 2) {
      leftRows.push(Math.max(fieldH(left[i][1], half), left[i + 1] ? fieldH(left[i + 1][1], half) : 0));
    }
    const leftH = leftRows.reduce((a, b) => a + b, 0);
    const rightH = right.reduce((a, [, v]) => a + fieldH(v, inner), 0);
    const bodyH = Math.max(leftH, rightH);
    const cardH = 26 + bodyH + 4;

    const y0 = doc.y;
    if (y0 + cardH > PAGE_H - FOOTER_H - 12) doc.addPage();
    const y = doc.y;
    for (const [x, title] of [
      [M, 'CLIENTE Y PEDIDO'],
      [M + cardW + gap, 'ENTREGA Y FACTURA ELECTRÓNICA'],
    ] as Array<[number, string]>) {
      doc.roundedRect(x, y, cardW, cardH, 6).lineWidth(0.8).stroke(LINE);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(ORANGE).text(title, x + 12, y + 10, { width: inner, characterSpacing: 0.6 });
    }

    let ly = y + 26;
    this.field(doc, M + 12, ly, left[0][0], left[0][1], inner, true);
    ly += leftRows[0];
    for (let i = 1, r = 1; i < left.length; i += 2, r++) {
      this.field(doc, M + 12, ly, left[i][0], left[i][1], half);
      if (left[i + 1]) this.field(doc, M + 12 + half + 12, ly, left[i + 1][0], left[i + 1][1], half);
      ly += leftRows[r];
    }
    let ry = y + 26;
    for (const [label, value] of right) {
      this.field(doc, M + cardW + gap + 12, ry, label, value, inner);
      ry += fieldH(value, inner);
    }
    doc.y = y + cardH + 16;
  }

  private field(doc: Doc, x: number, y: number, label: string, value: string, width: number, bold = false): void {
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(label.toUpperCase(), x, y, { width, characterSpacing: 0.4 });
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9)
      .fillColor(INK)
      .text(value, x, y + 10, { width });
  }

  private textHeight(doc: Doc, text: string, size: number, width: number): number {
    doc.font('Helvetica').fontSize(size);
    return doc.heightOfString(text, { width });
  }

  private renderLines(doc: Doc, draft: FacturacionDraft): void {
    // Línea | Tipo de película | Kilos | Precio USD/kg | Valor USD
    const cols: Array<{ w: number; align: 'left' | 'right'; label: string }> = [
      { w: 50, align: 'left', label: 'Línea' },
      { w: 182, align: 'left', label: 'Tipo de película' },
      { w: 95, align: 'right', label: 'Kilos' },
      { w: 95, align: 'right', label: 'Precio USD/kg' },
      { w: CONTENT_W - 422, align: 'right', label: 'Valor USD' },
    ];
    const rowH = 19;
    const pad = 8;
    const bottom = PAGE_H - FOOTER_H - 12;

    const header = () => {
      const y = doc.y;
      doc.rect(M, y, CONTENT_W, 20).fill(ORANGE);
      let x = M;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
      for (const c of cols) {
        doc.text(c.label, x + pad, y + 6.5, { width: c.w - pad * 2, align: c.align, lineBreak: false });
        x += c.w;
      }
      doc.y = y + 20;
    };

    if (doc.y + 20 + rowH * Math.min(draft.lines.length, 3) > bottom) doc.addPage();
    header();
    draft.lines.forEach((line, i) => {
      if (doc.y + rowH > bottom) {
        doc.addPage();
        header();
      }
      const y = doc.y;
      if (i % 2 === 1) doc.rect(M, y, CONTENT_W, rowH).fill('#FAFAFA');
      const values = [String(line.codSecLineFilm), line.tipoPelicula, num(line.kilosTotal), num(line.precio, 2, 4), num(line.valorLinea)];
      let x = M;
      doc.font('Helvetica').fontSize(8.5).fillColor(INK);
      cols.forEach((c, j) => {
        doc.text(values[j], x + pad, y + 6, { width: c.w - pad * 2, align: c.align, lineBreak: false, ellipsis: true });
        x += c.w;
      });
      doc.moveTo(M, y + rowH).lineTo(M + CONTENT_W, y + rowH).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.y = y + rowH;
    });

    // Totales, alineados a la derecha.
    if (doc.y + 58 > bottom) doc.addPage();
    const ty = doc.y + 10;
    const tw = 220;
    const tx = M + CONTENT_W - tw;
    doc.roundedRect(tx, ty, tw, 48, 6).fill(SOFT);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Total kilos', tx + 12, ty + 9, { width: 90 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(`${num(draft.totalKilos)} kg`, tx + 100, ty + 9, { width: tw - 112, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('Total valor', tx + 12, ty + 27, { width: 90 });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(ORANGE).text(`USD ${num(draft.totalValor)}`, tx + 90, ty + 24, { width: tw - 102, align: 'right' });
    doc.y = ty + 48 + 16;
  }

  private renderNotes(doc: Doc, draft: FacturacionDraft): void {
    const notas: Array<[string, string]> = [];
    if (draft.observaciones) notas.push(['Observaciones', draft.observaciones]);
    if (draft.infoComercial) notas.push(['Información comercial', draft.infoComercial]);
    for (const [label, value] of notas) {
      const h = 11 + this.textHeight(doc, value, 9, CONTENT_W - 24) + 18;
      if (doc.y + h > PAGE_H - FOOTER_H - 12) doc.addPage();
      const y = doc.y;
      doc.roundedRect(M, y, CONTENT_W, h, 6).lineWidth(0.8).stroke(LINE);
      this.field(doc, M + 12, y + 9, label, value, CONTENT_W - 24);
      doc.y = y + h + 10;
    }
  }

  /** Pie en todas las páginas: aviso fiscal + paginación. */
  private renderFooters(doc: Doc, factura: FacturaElectronica | null): void {
    const fiscal = !factura
      ? 'Factura electrónica aún no emitida: este documento no tiene validez fiscal.'
      : factura.simulated
        ? `${CUFE_SIMULADO_LABEL}: este documento no tiene validez fiscal.`
        : `Factura electrónica ${factura.invoiceNumber}, CUFE ${factura.cufe}.`;
    const texto = `Documento de apoyo generado por Oben Xmart con datos de Oben (Empaque Unificada / Check Settlement) para revisión de Facturación y COMEX. ${fiscal}`;
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Sin margen inferior mientras se dibuja el pie: si no, pdfkit abriría una página nueva.
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = PAGE_H - FOOTER_H + 6;
      doc.moveTo(M, y).lineTo(M + CONTENT_W, y).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.font('Helvetica-Oblique').fontSize(6.8).fillColor('#9CA3AF').text(texto, M, y + 8, { width: CONTENT_W - 70 });
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(MUTED)
        .text(`Página ${i - range.start + 1} de ${range.count}`, M + CONTENT_W - 70, y + 8, { width: 70, align: 'right' });
      doc.page.margins.bottom = bottom;
    }
  }
}
