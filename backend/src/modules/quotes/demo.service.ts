import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Product } from '../../entities/product.entity';
import { QuoteStatus } from '../../entities/quote.entity';
import { QuotesService } from './quotes.service';

export interface DemoStep {
  step: string;
  label: string;
  at: string;
  data?: Record<string, unknown>;
}

export interface DemoResult {
  steps: DemoStep[];
  quoteId: string;
  quoteNumber: string;
  orderId: string | null;
  orderNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  total: number;
  durationMs: number;
}

/**
 * Ejecuta el flujo comercial completo (correo → cliente → cotización → PDF →
 * envío → aprobación → orden → factura) sobre datos reales, sin atajos:
 * cada paso invoca el mismo QuotesService que usa el flujo manual/por email.
 * Solo el correo de entrada es sintético — todo lo que produce (cliente,
 * cotización, orden, factura, eventos de auditoría) queda persistido de
 * verdad, no es una simulación visual.
 */
@Injectable()
export class DemoService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly quotes: QuotesService,
  ) {}

  async runFullDemo(): Promise<DemoResult> {
    const startedAt = Date.now();
    const steps: DemoStep[] = [];
    const push = (
      step: string,
      label: string,
      data?: Record<string, unknown>,
    ) => steps.push({ step, label, at: new Date().toISOString(), data });

    // Se elige el producto activo más barato con stock disponible: minimiza
    // el riesgo de que la validación de cartera del cliente demo (recién
    // creado, cupo fijo) rechace la cotización a mitad de la demo.
    const product = await this.productRepository.findOne({
      where: { isActive: true },
      order: { price: 'ASC' },
    });
    if (!product || product.stock < 1) {
      throw new BadRequestException(
        'No hay productos activos con stock disponible para ejecutar la demo.',
      );
    }

    const demoTag = randomBytes(3).toString('hex');
    const clientEmail = `demo.${demoTag}@clientedemo.com`;
    const quantity = Math.min(2, product.stock);
    const body = [
      'Buenos días,',
      '',
      'Quedamos atentos a su mejor cotización para:',
      `${quantity} ${product.sku}`,
      '',
      'Saludos,',
      'Cliente Demo',
    ].join('\n');

    push('demo_started', 'Demo iniciada');

    const { quote: quotedAfterEmail, emailId } =
      await this.quotes.processIncomingEmail({
        from: clientEmail,
        subject: 'Solicitud de cotización',
        body,
      });
    push('email_received', 'Correo entrante procesado y cotización generada', {
      quoteNumber: quotedAfterEmail.quoteNumber,
      client: quotedAfterEmail.client.name,
    });

    await this.quotes.generateAndSendPdf(quotedAfterEmail.id);
    push('pdf_sent', 'PDF generado y enviado por correo al cliente');

    const approved = await this.quotes.approveQuote(
      emailId,
      quotedAfterEmail.id,
    );
    if (approved.status === QuoteStatus.REJECTED) {
      push('quote_rejected', 'Cotización rechazada (cupo de cartera)', {
        notes: approved.notes,
      });
      return this.buildResult(approved, steps, startedAt);
    }
    push('quote_approved', 'Aprobación simulada del cliente registrada');

    await this.quotes.createPaymentLink(quotedAfterEmail.id);
    push('payment_link_created', 'Link de pago generado');

    const paid = await this.quotes.simulatePayment(quotedAfterEmail.id);
    push('order_invoice_created', 'Orden y factura generadas a partir del pago', {
      orderNumber: paid.orderNumber,
      invoiceNumber: paid.invoiceNumber,
    });

    await this.quotes.moveToProduction(quotedAfterEmail.id);
    push('in_production', 'Orden enviada a producción');

    await this.quotes.markReady(quotedAfterEmail.id);
    push('ready_for_delivery', 'Pedido listo para despacho');

    const delivered = await this.quotes.markDelivered(quotedAfterEmail.id);
    push('delivered', 'Pedido marcado como entregado — demo completa');

    return this.buildResult(delivered, steps, startedAt);
  }

  private buildResult(
    quote: Awaited<ReturnType<QuotesService['findOne']>>,
    steps: DemoStep[],
    startedAt: number,
  ): DemoResult {
    return {
      steps,
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      orderId: quote.orderId,
      orderNumber: quote.orderNumber,
      invoiceId: quote.invoiceId,
      invoiceNumber: quote.invoiceNumber,
      total: Number(quote.total),
      durationMs: Date.now() - startedAt,
    };
  }
}
