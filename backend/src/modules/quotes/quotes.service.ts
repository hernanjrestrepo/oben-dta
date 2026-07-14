import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Quote, QuoteStatus } from '../../entities/quote.entity';
import { QuoteItem } from '../../entities/quote-item.entity';
import { Client } from '../../entities/client.entity';
import { Product } from '../../entities/product.entity';
import { EmailService } from './email.service';
import { QuotePdfService } from './quote-pdf.service';
import { PaymentService } from './payment.service';
import { renderQuoteResponseEmail } from './email-templates';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { OrdersService } from '../orders/orders.service';
import { InvoicesService } from '../invoices/invoices.service';
import { OrderStatus } from '../../entities/order.entity';

const WORKFLOW_NAME = 'quote-to-cash';

export interface ProcessEmailDto {
  from: string;
  subject: string;
  body: string;
}

export interface QuoteFlowResult {
  quote: Quote;
  emailId: string;
  steps: string[];
}

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote)
    private quoteRepository: Repository<Quote>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    private emailService: EmailService,
    private pdfService: QuotePdfService,
    private paymentService: PaymentService,
    private readonly ctx: TenantContext,
    private readonly hub: IntegrationHubService,
    private readonly audit: WorkflowAuditService,
    private readonly orders: OrdersService,
    private readonly invoices: InvoicesService,
  ) {}

  async processIncomingEmail(dto: ProcessEmailDto): Promise<QuoteFlowResult> {
    const steps: string[] = [];
    const tenantId = this.ctx.tenantId;

    const email = await this.emailService.receiveEmail(dto);
    steps.push(`Email recibido de ${dto.from}: "${dto.subject}"`);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.WORKFLOW_STARTED,
      action: 'email_received',
      entityType: 'quote',
      entityId: email.id,
      inputData: { from: dto.from, subject: dto.subject },
    });

    let client = await this.clientRepository.findOne({
      where: { email: dto.from, tenantId },
    });
    let clientWasCreated = false;
    if (!client) {
      client = await this.clientRepository.save({
        clientId: `CLI-${Date.now()}`,
        name: dto.from.split('@')[0].toUpperCase(),
        email: dto.from,
        creditLimit: 500000,
        usedCredit: 0,
        isActive: true,
        tenantId,
      });
      clientWasCreated = true;
      steps.push(`Cliente nuevo creado: ${client.name}`);
    } else {
      steps.push(`Cliente identificado: ${client.name}`);
    }
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      action: clientWasCreated ? 'client_created' : 'client_matched',
      entityType: 'client',
      entityId: client.id,
      outputData: { name: client.name, email: client.email, isNew: clientWasCreated },
    });

    const items = this.parseItemsFromText(dto.body);
    steps.push(`Items detectados: ${items.length}`);

    const quote = this.quoteRepository.create({
      quoteNumber: `COT-${Date.now()}`,
      client,
      clientId: client.id,
      originalEmail: dto.body,
      status: QuoteStatus.RECEIVED,
      items: [],
      subtotal: 0,
      taxAmount: 0,
      total: 0,
      tenantId,
    });

    let subtotal = 0;
    const quoteItems: QuoteItem[] = [];

    for (const item of items) {
      const product = await this.productRepository.findOne({
        where: { sku: ILike(item.sku), tenantId },
      });
      if (product) {
        const totalPrice = Number(product.price) * item.qty;
        const qi = new QuoteItem();
        qi.product = product;
        qi.productId = product.id;
        qi.quantity = item.qty;
        qi.unitPrice = Number(product.price);
        qi.totalPrice = totalPrice;
        qi.tenantId = tenantId;
        quoteItems.push(qi);
        subtotal += totalPrice;
      }
    }

    quote.items = quoteItems;
    quote.subtotal = subtotal;
    quote.taxAmount = subtotal * 0.19;
    quote.total = subtotal + quote.taxAmount;
    quote.status = QuoteStatus.QUOTED;

    const saved = await this.quoteRepository.save(quote);
    steps.push(
      `Cotización #${saved.quoteNumber} generada. Total: $${saved.total.toLocaleString('es-CO')}`,
    );
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      action: 'quote_generated',
      entityType: 'quote',
      entityId: saved.id,
      fromState: QuoteStatus.RECEIVED,
      toState: QuoteStatus.QUOTED,
      outputData: { quoteNumber: saved.quoteNumber, total: saved.total, items: quoteItems.length },
    });

    return { quote: saved, emailId: email.id, steps };
  }

  async generateAndSendPdf(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    const pdfBuffer = await this.pdfService.generateQuotePdf(quote);
    const pdfBase64 = pdfBuffer.toString('base64');
    quote.pdfUrl = `data:application/pdf;base64,${pdfBase64}`;

    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      action: 'pdf_generated',
      entityType: 'quote',
      entityId: quote.id,
      outputData: { sizeBytes: pdfBuffer.length },
    });

    // Envío real (vía simulador) de la respuesta al cliente — antes este paso
    // solo cambiaba el estado sin enviar nada. El PDF va referenciado en el
    // cuerpo (el adapter mock no modela adjuntos binarios) y queda disponible
    // para descarga desde la propia cotización.
    const { subject, html } = renderQuoteResponseEmail(quote);
    const sendResult = await this.hub.call<{ id: string; sentAt: string }>(
      'email',
      'send',
      { to: quote.client.email, subject, body: html },
    );
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'email_sent',
      entityType: 'quote',
      entityId: quote.id,
      outputData: {
        to: quote.client.email,
        ok: sendResult.ok,
        messageId: sendResult.data?.id ?? null,
      },
      reason: sendResult.ok ? null : sendResult.error,
    });

    quote.status = QuoteStatus.SENT;
    return this.quoteRepository.save(quote);
  }

  async approveQuote(emailId: string, quoteId: string): Promise<Quote> {
    const email = await this.emailService.simulateClientApproval(emailId);
    if (!email) throw new NotFoundException('Email no encontrado');

    const quote = await this.findOne(quoteId);
    const inventoryChecks = this.validateInventory(quote);
    const creditCheck = this.validateCredit(quote);

    if (!creditCheck.passed) {
      quote.status = QuoteStatus.REJECTED;
      quote.notes = `Cartera insuficiente. Disponible: $${creditCheck.available.toLocaleString('es-CO')}`;
      const saved = await this.quoteRepository.save(quote);
      await this.audit.log({
        workflowName: WORKFLOW_NAME,
        eventType: WorkflowEventType.APPROVAL_REJECTED,
        action: 'quote_rejected_credit',
        entityType: 'quote',
        entityId: quote.id,
        toState: QuoteStatus.REJECTED,
        reason: quote.notes,
      });
      return saved;
    }

    quote.status = QuoteStatus.APPROVED;
    quote.approvedAt = new Date();
    quote.notes = inventoryChecks.allAvailable
      ? 'Todo en inventario. Listo para producción.'
      : `Inventario parcial. ${inventoryChecks.missing.map((m) => `${m.sku} falta ${m.missing}`).join(', ')}`;

    const saved = await this.quoteRepository.save(quote);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.APPROVAL_GRANTED,
      action: 'quote_approved',
      entityType: 'quote',
      entityId: quote.id,
      toState: QuoteStatus.APPROVED,
    });
    return saved;
  }

  async rejectQuote(emailId: string, quoteId: string): Promise<Quote> {
    const email = await this.emailService.simulateClientRejection(emailId);
    if (!email) throw new NotFoundException('Email no encontrado');

    const quote = await this.findOne(quoteId);
    quote.status = QuoteStatus.REJECTED;
    quote.notes = 'Rechazada por el cliente.';
    const saved = await this.quoteRepository.save(quote);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.APPROVAL_REJECTED,
      action: 'quote_rejected_client',
      entityType: 'quote',
      entityId: quote.id,
      toState: QuoteStatus.REJECTED,
    });
    return saved;
  }

  async createPaymentLink(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    const link = await this.paymentService.createPaymentLink(
      quoteId,
      Number(quote.total),
    );
    quote.paymentLink = link.url;
    quote.status = QuoteStatus.PAYMENT_PENDING;
    const saved = await this.quoteRepository.save(quote);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      action: 'payment_link_created',
      entityType: 'quote',
      entityId: quote.id,
      toState: QuoteStatus.PAYMENT_PENDING,
    });
    return saved;
  }

  async simulatePayment(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);

    if (quote.paymentLink) {
      const linkId = quote.paymentLink.split('/').pop()!;
      await this.paymentService.simulatePayment(linkId);
    }

    quote.status = QuoteStatus.PAID;
    quote.paidAt = new Date();

    for (const item of quote.items || []) {
      if (item.product) {
        // decrement() emite un UPDATE ... SET stock = stock - N atómico en
        // Postgres — leer product.stock en JS y restar antes de guardar
        // pierde actualizaciones bajo pagos concurrentes sobre el mismo SKU
        // (reproducido en pruebas: dos decrementos de 2 colapsaron en uno).
        await this.productRepository.decrement(
          { id: item.product.id, tenantId: this.ctx.tenantId },
          'stock',
          item.quantity,
        );
      }
    }
    quote.client.usedCredit =
      Number(quote.client.usedCredit) + Number(quote.total);
    await this.clientRepository.save(quote.client);

    // Orden y factura reales (antes solo se escribía un invoiceNumber inventado
    // sin fila de Order/Invoice detrás). Se generan a partir de los mismos
    // items ya validados de la cotización — no repite el descuento de stock,
    // OrdersService no lo toca.
    const order = await this.orders.create(
      {
        clientId: quote.client.id,
        orderNumber: `OP-${Date.now()}`,
        notes: `Generada automáticamente desde cotización ${quote.quoteNumber}`,
        items: (quote.items || [])
          .filter((item) => item.product)
          .map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
      },
      undefined,
    );
    const invoice = await this.invoices.createFromOrder({
      orderId: order.id,
    });

    quote.orderId = order.id;
    quote.orderNumber = order.orderNumber;
    quote.invoiceId = invoice.id;
    quote.invoiceNumber = invoice.invoiceNumber;

    const saved = await this.quoteRepository.save(quote);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      action: 'payment_confirmed',
      entityType: 'quote',
      entityId: quote.id,
      toState: QuoteStatus.PAID,
      outputData: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        total: quote.total,
      },
    });
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      action: 'order_created',
      entityType: 'order',
      entityId: order.id,
      outputData: { orderNumber: order.orderNumber, total: order.totalAmount },
    });
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      action: 'invoice_created',
      entityType: 'invoice',
      entityId: invoice.id,
      outputData: {
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
      },
    });
    return saved;
  }

  async moveToProduction(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    quote.status = QuoteStatus.IN_PRODUCTION;
    if (quote.orderId) {
      await this.advanceOrder(quote.orderId, [
        OrderStatus.PENDING_VALIDATION,
        OrderStatus.CONFIRMED,
        OrderStatus.PENDING_PRODUCTION,
        OrderStatus.IN_PRODUCTION,
      ]);
    }
    const saved = await this.quoteRepository.save(quote);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.STATE_TRANSITION,
      action: 'moved_to_production',
      entityType: 'quote',
      entityId: quote.id,
      toState: QuoteStatus.IN_PRODUCTION,
    });
    return saved;
  }

  async markReady(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    quote.status = QuoteStatus.READY_FOR_DELIVERY;
    if (quote.orderId) {
      await this.advanceOrder(quote.orderId, [OrderStatus.READY_FOR_DELIVERY]);
    }
    const saved = await this.quoteRepository.save(quote);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.STATE_TRANSITION,
      action: 'marked_ready',
      entityType: 'quote',
      entityId: quote.id,
      toState: QuoteStatus.READY_FOR_DELIVERY,
    });
    return saved;
  }

  async markDelivered(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    quote.status = QuoteStatus.DELIVERED;
    quote.deliveredAt = new Date();
    if (quote.orderId) {
      await this.advanceOrder(quote.orderId, [OrderStatus.DELIVERED]);
    }
    const saved = await this.quoteRepository.save(quote);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.WORKFLOW_COMPLETED,
      action: 'marked_delivered',
      entityType: 'quote',
      entityId: quote.id,
      toState: QuoteStatus.DELIVERED,
    });
    return saved;
  }

  // Mantiene sincronizado el estado de la orden real detrás de la cotización.
  // OrdersService.updateStatus valida cada salto de la máquina de estados
  // (ver getValidTransitions), así que hay que recorrer los intermedios en
  // orden — no se puede saltar directo de DRAFT a IN_PRODUCTION.
  private async advanceOrder(
    orderId: string,
    targets: OrderStatus[],
  ): Promise<void> {
    for (const status of targets) {
      await this.orders.updateStatus(orderId, { status });
    }
  }

  async findAll(): Promise<Quote[]> {
    return this.quoteRepository.find({
      where: { tenantId: this.ctx.tenantId },
      relations: ['client', 'items', 'items.product'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Quote> {
    const quote = await this.quoteRepository.findOne({
      where: { id, tenantId: this.ctx.tenantId },
      relations: ['client', 'items', 'items.product'],
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    return quote;
  }

  async getInbox() {
    return this.emailService.getInbox();
  }

  private parseItemsFromText(
    text: string,
  ): Array<{ sku: string; qty: number }> {
    // El SKU real (ver buildProducts en dataset-builders.ts) es
    // "SKU-<tag-opcional>-<6 dígitos>", no "SKU-" + 3 dígitos fijos — el
    // patrón debe capturar cualquier sufijo alfanumérico/guiones.
    const matches = text.matchAll(/(\d+)\s+(SKU-[A-Za-z0-9-]+)/gi);
    const items: Array<{ sku: string; qty: number }> = [];
    for (const match of matches) {
      // El run-tag del SKU puede incluir minúsculas (ver buildProducts) — no
      // forzar mayúsculas aquí, la búsqueda contra BD ya es case-insensitive.
      items.push({ qty: parseInt(match[1], 10), sku: match[2] });
    }
    return items;
  }

  private validateInventory(quote: Quote) {
    const missing: Array<{ sku: string; missing: number }> = [];
    let allAvailable = true;

    for (const item of quote.items || []) {
      if (!item.product) continue;
      const available = item.product.stock - item.product.committed;
      if (item.quantity > available) {
        allAvailable = false;
        missing.push({
          sku: item.product.sku,
          missing: item.quantity - available,
        });
      }
    }
    return { allAvailable, missing };
  }

  private validateCredit(quote: Quote) {
    const client = quote.client;
    const available = Number(client.creditLimit) - Number(client.usedCredit);
    const passed = Number(quote.total) <= available;
    return {
      passed,
      available,
      limit: client.creditLimit,
      used: client.usedCredit,
    };
  }
}
