import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { FacturaElectronica, FacturacionDraft, FacturacionKind } from './facturacion.types';

const PAGE_MARGIN = 36;
const PAGE_WIDTH = 612; // letter, points
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const KIND_LABEL: Record<FacturacionKind, string> = {
  exportacion: 'Pedido de Exportación',
  nacional_completo: 'Pedido Nacional — Despacho Completo',
  nacional_parcial: 'Pedido Nacional — Despacho Parcial',
};

/** Rótulo obligatorio mientras el CUFE salga del simulador DIAN. */
export const CUFE_SIMULADO_LABEL = 'CUFE SIMULADO — pendiente de proveedor DIAN real';

/**
 * Documento de apoyo para Facturación/COMEX armado con datos reales
 * (Empaque Unificada + Check Settlement) según los 3 flujos descritos en
 * `Business/OBEN MAS - PARADIXE.pdf`. Todo dato SIMULADO (CUFE del simulador
 * DIAN, dirección tomada de Oben+ simulado) se rotula como tal en un recuadro
 * al inicio, junto al propio dato y en el pie — nadie debe poder tomarlo como
 * el documento fiscal final.
 */
@Injectable()
export class FacturacionPdfService {
  async build(draft: FacturacionDraft, facturaElectronica: FacturaElectronica | null = null): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'letter', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.renderHeader(doc, draft);
    this.renderSimulationBanner(doc, draft, facturaElectronica);
    this.renderInfoBox(doc, draft, facturaElectronica);
    this.renderLines(doc, draft);
    this.renderFooter(doc, facturaElectronica);

    doc.end();
    return done;
  }

  private renderHeader(doc: PDFKit.PDFDocument, draft: FacturacionDraft): void {
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#F47735').text('oben', PAGE_MARGIN, doc.y, { continued: true });
    doc.font('Helvetica').fontSize(8).fillColor('#666666').text('  Holding Group', { continued: false });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#333333')
      .text('OBEN COLOMBIA S.A.S.\nWWW.OBENGROUP.COM\nTEL. (57) 1 7467700\nGALAPA - COLOMBIA', PAGE_MARGIN + 350, PAGE_MARGIN, {
        width: CONTENT_WIDTH - 350,
        align: 'right',
      });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('BORRADOR DE FACTURACIÓN', PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
    doc.font('Helvetica').fontSize(9).fillColor('#666666').text(draft.kind ? KIND_LABEL[draft.kind] : 'Tipo de pedido sin clasificar (falta el país)', PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
    doc.moveDown(0.5);
  }

  private renderSimulationBanner(
    doc: PDFKit.PDFDocument,
    draft: FacturacionDraft,
    factura: FacturaElectronica | null,
  ): void {
    const avisos: string[] = [];
    if (factura?.simulated) avisos.push(`${CUFE_SIMULADO_LABEL}.`);
    if (draft.simulatedFields.includes('direccionEntrega')) {
      avisos.push('Dirección de entrega SIMULADA (Oben+ aún no tiene API real).');
    }
    if (avisos.length === 0) return;
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#B00020')
      .text(`DOCUMENTO CON DATOS SIMULADOS — ${avisos.join(' ')}`, PAGE_MARGIN, doc.y, {
        width: CONTENT_WIDTH,
        align: 'center',
      });
    doc.moveDown(0.5);
  }

  private renderInfoBox(doc: PDFKit.PDFDocument, draft: FacturacionDraft, factura: FacturaElectronica | null): void {
    const direccion = draft.direccionEntrega
      ? `${draft.direccionEntrega}${draft.simulatedFields.includes('direccionEntrega') ? ' (SIMULADA — Oben+)' : ''}`
      : '— (sin definir)';
    const facturaElectronica = factura
      ? `${factura.invoiceNumber} — CUFE ${factura.cufe}${factura.simulated ? ` (${CUFE_SIMULADO_LABEL})` : ''}`
      : 'Pendiente de emisión (se emite al enviar a COMEX)';
    const rows: Array<[string, string]> = [
      ['Orden de venta', String(draft.numberOrderSales)],
      ['Cliente', draft.cliente],
      ['País', draft.pais ?? '—'],
      ['Proforma', draft.proforma ?? '—'],
      ['Orden de compra', draft.ordenCompra ?? '—'],
      ['Contenedor', draft.contenedor ?? '—'],
      ['Código de material', draft.codigoMaterial ?? '—'],
      ['Dirección de entrega', direccion],
      ['Factura electrónica', facturaElectronica],
    ];
    doc.font('Helvetica').fontSize(9).fillColor('#111111');
    for (const [label, value] of rows) {
      doc.font('Helvetica-Bold').text(`${label}: `, PAGE_MARGIN, doc.y, { continued: true }).font('Helvetica').text(value);
    }
    if (draft.observaciones) {
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').text('Observaciones: ', PAGE_MARGIN, doc.y, { continued: true }).font('Helvetica').text(draft.observaciones);
    }
    if (draft.infoComercial) {
      doc.font('Helvetica-Bold').text('Info. comercial: ', PAGE_MARGIN, doc.y, { continued: true }).font('Helvetica').text(draft.infoComercial);
    }
    doc.moveDown(0.5);
  }

  private renderLines(doc: PDFKit.PDFDocument, draft: FacturacionDraft): void {
    const colX = [PAGE_MARGIN, PAGE_MARGIN + 220, PAGE_MARGIN + 320, PAGE_MARGIN + 420];
    const colW = [220, 100, 100, CONTENT_WIDTH - 420];
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333');
    doc.text('Tipo de película', colX[0], y, { width: colW[0] });
    doc.text('Precio', colX[1], y, { width: colW[1] });
    doc.text('Kilos', colX[2], y, { width: colW[2] });
    doc.text('Valor línea', colX[3], y, { width: colW[3] });
    doc.moveDown(0.5);
    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(8).fillColor('#111111');
    for (const line of draft.lines) {
      const rowY = doc.y;
      doc.text(line.tipoPelicula, colX[0], rowY, { width: colW[0] });
      doc.text(line.precio.toLocaleString('en-US', { minimumFractionDigits: 2 }), colX[1], rowY, { width: colW[1] });
      doc.text(line.kilosTotal.toLocaleString('en-US', { minimumFractionDigits: 2 }), colX[2], rowY, { width: colW[2] });
      doc.text(line.valorLinea.toLocaleString('en-US', { minimumFractionDigits: 2 }), colX[3], rowY, { width: colW[3] });
      doc.moveDown(0.4);
    }

    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text(`Total kilos: ${draft.totalKilos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, PAGE_MARGIN, doc.y);
    doc.text(`Total valor: ${draft.totalValor.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, PAGE_MARGIN, doc.y);
    doc.moveDown(1);
  }

  private renderFooter(doc: PDFKit.PDFDocument, factura: FacturaElectronica | null): void {
    const fiscal = !factura
      ? 'Factura electrónica aún no emitida: este documento no tiene validez fiscal.'
      : factura.simulated
        ? `${CUFE_SIMULADO_LABEL}: este documento no tiene validez fiscal.`
        : `Factura electrónica ${factura.invoiceNumber}, CUFE ${factura.cufe}.`;
    doc
      .font('Helvetica-Oblique')
      .fontSize(7)
      .fillColor('#888888')
      .text(
        `Documento de apoyo generado por Oben Xmart con datos de Oben (Empaque Unificada / Check Settlement) para revisión de Facturación y COMEX. ${fiscal}`,
        PAGE_MARGIN,
        doc.y,
        { width: CONTENT_WIDTH },
      );
  }
}
