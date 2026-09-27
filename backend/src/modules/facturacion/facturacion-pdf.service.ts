import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { FacturacionDraft, FacturacionKind } from './facturacion.types';

const PAGE_MARGIN = 36;
const PAGE_WIDTH = 612; // letter, points
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const KIND_LABEL: Record<FacturacionKind, string> = {
  exportacion: 'Pedido de Exportación',
  nacional_completo: 'Pedido Nacional — Despacho Completo',
  nacional_parcial: 'Pedido Nacional — Despacho Parcial',
};

/**
 * Documento de apoyo para Facturación/COMEX armado con datos reales
 * (Empaque Unificada + Check Settlement) según los 3 flujos descritos en
 * `Business/OBEN MAS - PARADIXE.pdf`. Deliberadamente NO es la factura
 * electrónica DIAN: no existe todavía un proveedor de facturación
 * electrónica definido (pregunta abierta con Oben, 2026-09-27) ni CUFE, así
 * que el PDF lo deja explícito en el pie de página para que nadie lo tome
 * como el documento fiscal final.
 */
@Injectable()
export class FacturacionPdfService {
  async build(draft: FacturacionDraft): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'letter', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.renderHeader(doc, draft);
    this.renderInfoBox(doc, draft);
    this.renderLines(doc, draft);
    this.renderFooter(doc);

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

  private renderInfoBox(doc: PDFKit.PDFDocument, draft: FacturacionDraft): void {
    const rows: Array<[string, string]> = [
      ['Orden de venta', String(draft.numberOrderSales)],
      ['Cliente', draft.cliente],
      ['País', draft.pais ?? '—'],
      ['Proforma', draft.proforma ?? '—'],
      ['Orden de compra', draft.ordenCompra ?? '—'],
      ['Contenedor', draft.contenedor ?? '—'],
      ['Código de material', draft.codigoMaterial ?? '—'],
      ['Dirección de entrega', draft.direccionEntrega ?? '— (sin definir)'],
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

  private renderFooter(doc: PDFKit.PDFDocument): void {
    doc
      .font('Helvetica-Oblique')
      .fontSize(7)
      .fillColor('#888888')
      .text(
        'Documento de apoyo generado por Oben Xmart con datos reales de Oben (Empaque Unificada / Check Settlement) para revisión de Facturación y COMEX. ' +
          'No constituye la factura electrónica DIAN — el proveedor de facturación electrónica aún no está definido.',
        PAGE_MARGIN,
        doc.y,
        { width: CONTENT_WIDTH },
      );
  }
}
