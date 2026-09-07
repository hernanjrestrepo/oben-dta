import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as bwipjs from 'bwip-js';

interface RollDetail {
  RollBarCode: string;
  ThicknessWidthNetWeightLot: string;
  FilmType: string;
}

interface PalletDetail {
  NroUnico: number | string;
  Producto: string;
  TotalNetWeight: number;
  TotalGrossWeight: number;
  Detalle2: RollDetail[];
}

interface SolefilmesData {
  Customer: string;
  Date: string;
  PurchaseOrder?: string | number;
  Container?: string | number;
  OrderNumber: string | number;
  TotalNetWeight: number;
  TotalGrossWeight: number;
  Rolls: number;
  Pallets: number;
  Detalle1: PalletDetail[];
}

const PAGE_MARGIN = 36;
const PAGE_WIDTH = 612; // letter, points
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

/**
 * Reproduce el reporte "SHIPMENT TRACEABILITY" que hoy genera Oben en
 * Crystal Reports (ver Business/ y el .rpt/PDF de referencia que compartió
 * José el 2026-09-07) — SOLO para el cliente Solefilmes, a partir de datos
 * reales de `spEmpaqueSolefilmes_Paradixe` (confirmados en vivo contra la
 * orden 10824, la misma del PDF de ejemplo — mismos números exactos).
 * No es una réplica pixel a pixel del .rpt (no tenemos Crystal Reports para
 * abrirlo), pero sí reproduce toda la información real y su organización:
 * encabezado con códigos de barra, y detalle de rollos por paleta con el
 * código de barra de cada rollo.
 */
@Injectable()
export class SolefilmesPdfService {
  async build(data: SolefilmesData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'letter', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    await this.renderHeader(doc, data);
    await this.renderInfoBox(doc, data);

    for (const pallet of data.Detalle1) {
      const needed = 70 + pallet.Detalle2.length * 38;
      await this.ensureSpace(doc, data, needed);
      await this.renderPallet(doc, pallet);
    }

    doc.end();
    return done;
  }

  private async ensureSpace(doc: PDFKit.PDFDocument, data: SolefilmesData, needed: number): Promise<void> {
    if (doc.y + needed > doc.page.height - PAGE_MARGIN) {
      doc.addPage();
      await this.renderHeader(doc, data, true);
    }
  }

  private async renderHeader(doc: PDFKit.PDFDocument, data: SolefilmesData, compact = false): Promise<void> {
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
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('SHIPMENT TRACEABILITY', PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
    doc.moveDown(0.5);
    if (!compact) {
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text(`Customer: `, PAGE_MARGIN, doc.y, { continued: true }).font('Helvetica').text(data.Customer, { continued: true });
      doc.font('Helvetica-Bold').text(`   Date: `, { continued: true }).font('Helvetica').text(data.Date);
      doc.moveDown(0.3);
    }
  }

  private async renderInfoBox(doc: PDFKit.PDFDocument, data: SolefilmesData): Promise<void> {
    const startY = doc.y;
    const colW = CONTENT_WIDTH / 2;

    await this.barcodeField(doc, 'Purchase Order', String(data.PurchaseOrder ?? '—'), PAGE_MARGIN, startY, colW - 10);
    await this.barcodeField(doc, 'Container', String(data.Container ?? '—'), PAGE_MARGIN + colW, startY, colW - 10);

    doc.y = startY;
    const row2Y = Math.max(doc.y, startY) + 46;
    await this.barcodeField(doc, 'Order Number', String(data.OrderNumber), PAGE_MARGIN, row2Y, colW - 10);
    await this.barcodeField(
      doc,
      'Total Net / Gross Weight Container',
      `${data.TotalNetWeight.toLocaleString('en-US')}  /  ${data.TotalGrossWeight.toLocaleString('en-US')}`,
      PAGE_MARGIN + colW,
      row2Y,
      colW - 10,
    );

    const row3Y = row2Y + 46;
    await this.barcodeField(doc, 'Rolls (container)', String(data.Rolls), PAGE_MARGIN, row3Y, colW / 2 - 10);
    await this.barcodeField(doc, 'Pallets (container)', String(data.Pallets), PAGE_MARGIN + colW / 2, row3Y, colW / 2 - 10);

    doc.y = row3Y + 46;
    doc.moveDown(0.5);
  }

  private async renderPallet(doc: PDFKit.PDFDocument, pallet: PalletDetail): Promise<void> {
    const startY = doc.y;
    const colW = CONTENT_WIDTH / 4;
    await this.barcodeField(doc, 'Nro Unico', String(pallet.NroUnico), PAGE_MARGIN, startY, colW - 8);
    await this.barcodeField(doc, 'Product', pallet.Producto, PAGE_MARGIN + colW, startY, colW - 8);
    await this.barcodeField(doc, 'Total Net Weight', pallet.TotalNetWeight.toFixed(2), PAGE_MARGIN + colW * 2, startY, colW - 8);
    await this.barcodeField(doc, 'Total Gross Weight', pallet.TotalGrossWeight.toFixed(2), PAGE_MARGIN + colW * 3, startY, colW - 8);

    // Columnas del detalle de rollos: Roll Bar Code (ancha) / Thickness-Width-Net Weight-Lot / Film Type.
    const rollColX = [PAGE_MARGIN, PAGE_MARGIN + colW * 2, PAGE_MARGIN + colW * 3.15];
    const rollColW = [colW * 2 - 8, colW * 1.1, colW * 0.8];

    let y = startY + 50;
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#333333');
    doc.text('Roll Bar Code', rollColX[0], y, { width: rollColW[0] });
    doc.text('Thickness-Width-Net Weight-Lot', rollColX[1], y, { width: rollColW[1] });
    doc.text('Film Type', rollColX[2], y, { width: rollColW[2] });
    y += 12;

    for (const roll of pallet.Detalle2) {
      await this.barcodeField(doc, null, roll.RollBarCode, rollColX[0], y, rollColW[0], true);
      await this.barcodeField(doc, null, roll.ThicknessWidthNetWeightLot, rollColX[1], y, rollColW[1], true);
      await this.barcodeField(doc, null, roll.FilmType, rollColX[2], y, rollColW[2], true);
      y += 38;
    }
    doc.y = y + 6;
  }

  private async barcodeField(
    doc: PDFKit.PDFDocument,
    label: string | null,
    value: string,
    x: number,
    y: number,
    width: number,
    small = false,
  ): Promise<void> {
    let cursorY = y;
    if (label) {
      doc.font('Helvetica').fontSize(7).fillColor('#666666').text(label, x, cursorY, { width });
      cursorY += 10;
    }
    const png = await this.renderBarcode(value);
    const barHeight = small ? 16 : 20;
    if (png) {
      doc.image(png, x, cursorY, { width: Math.min(width, small ? 110 : 140), height: barHeight });
    }
    doc
      .font(small ? 'Helvetica' : 'Helvetica-Bold')
      .fontSize(small ? 7 : 9)
      .fillColor('#111111')
      .text(value, x, cursorY + barHeight + 2, { width });
  }

  private async renderBarcode(text: string): Promise<Buffer | null> {
    if (!text || !text.trim()) return null;
    try {
      return await bwipjs.toBuffer({
        bcid: 'code128',
        text,
        scale: 2,
        height: 8,
        includetext: false,
      });
    } catch {
      // Un valor no codificable (ej. vacío tras limpiar espacios) no debe
      // tumbar la generación de todo el documento — se omite ese código de
      // barra puntual y el valor en texto igual queda visible.
      return null;
    }
  }
}
