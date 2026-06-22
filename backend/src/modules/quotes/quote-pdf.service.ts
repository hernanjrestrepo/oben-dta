import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Quote } from '../../entities/quote.entity';
import { QuoteItem } from '../../entities/quote-item.entity';

@Injectable()
export class QuotePdfService {
  async generateQuotePdf(quote: Quote): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .fillColor('#003366')
        .fontSize(28)
        .text('OBEN GROUP', 50, 50)
        .fontSize(12)
        .fillColor('#666666')
        .text(
          'Digitalización Total Autónoma - Sistema de Cotizaciones',
          50,
          85,
        );

      // Line
      doc
        .strokeColor('#009966')
        .lineWidth(3)
        .moveTo(50, 110)
        .lineTo(550, 110)
        .stroke();

      // Quote Info
      doc
        .fillColor('#333333')
        .fontSize(14)
        .text(`Cotización #${quote.quoteNumber}`, 50, 130)
        .fontSize(10)
        .fillColor('#666666')
        .text(`Fecha: ${quote.createdAt.toLocaleDateString('es-CO')}`, 50, 155)
        .text(`Estado: ${this.statusLabel(quote.status)}`, 50, 170);

      // Client Info
      doc
        .fillColor('#003366')
        .fontSize(12)
        .text('CLIENTE', 50, 200)
        .fillColor('#333333')
        .fontSize(10)
        .text(quote.client.name, 50, 218)
        .text(`Email: ${quote.client.email}`, 50, 233)
        .text(`Tel: ${quote.client.phone || 'N/A'}`, 50, 248);

      // Table Header
      let y = 290;
      doc
        .fillColor('#003366')
        .rect(50, y, 500, 25)
        .fill()
        .fillColor('#FFFFFF')
        .fontSize(10)
        .text('Producto', 60, y + 7)
        .text('SKU', 220, y + 7)
        .text('Cant.', 300, y + 7)
        .text('Precio Unit.', 350, y + 7)
        .text('Total', 460, y + 7);

      // Table Rows
      y += 35;
      (quote.items || []).forEach((item: QuoteItem, i: number) => {
        const bg = i % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
        doc
          .fillColor(bg)
          .rect(50, y - 5, 500, 25)
          .fill()
          .fillColor('#333333')
          .fontSize(9)
          .text(item.product?.name || 'Producto', 60, y)
          .text(item.product?.sku || 'N/A', 220, y)
          .text(item.quantity.toString(), 310, y)
          .text(`$${Number(item.unitPrice).toLocaleString('es-CO')}`, 350, y)
          .text(`$${Number(item.totalPrice).toLocaleString('es-CO')}`, 460, y);
        y += 25;
      });

      // Totals
      y += 20;
      doc
        .fillColor('#333333')
        .fontSize(10)
        .text(
          `Subtotal: $${Number(quote.subtotal).toLocaleString('es-CO')}`,
          400,
          y,
          { align: 'right' },
        )
        .text(
          `IVA (19%): $${Number(quote.taxAmount).toLocaleString('es-CO')}`,
          400,
          y + 15,
          { align: 'right' },
        )
        .fillColor('#003366')
        .fontSize(14)
        .text(
          `TOTAL: $${Number(quote.total).toLocaleString('es-CO')}`,
          400,
          y + 40,
          { align: 'right' },
        );

      // Footer
      doc
        .fillColor('#666666')
        .fontSize(8)
        .text(
          'Oben Group - Digitalización Total Autónoma | www.obengroup.com',
          50,
          750,
        )
        .text('Esta cotización es válida por 30 días calendario.', 50, 762);

      doc.end();
    });
  }

  private statusLabel(status: string): string {
    const labels: Record<string, string> = {
      RECEIVED: 'Recibida',
      PARSING: 'Analizando',
      QUOTED: 'Cotizada',
      SENT: 'Enviada',
      APPROVED: 'Aprobada',
      ORDERED: 'En Pedido',
      PAYMENT_PENDING: 'Pago Pendiente',
      PAID: 'Pagada',
      IN_PRODUCTION: 'En Producción',
      READY_FOR_DELIVERY: 'Lista para Entrega',
      DELIVERED: 'Entregada',
      REJECTED: 'Rechazada',
    };
    return labels[status] || status;
  }
}
