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
import { TenantContext } from '../../common/tenant/tenant-context.service';

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
  ) {}

  async processIncomingEmail(dto: ProcessEmailDto): Promise<QuoteFlowResult> {
    const steps: string[] = [];
    const tenantId = this.ctx.tenantId;

    const email = await this.emailService.receiveEmail(dto);
    steps.push(`Email recibido de ${dto.from}: "${dto.subject}"`);

    let client = await this.clientRepository.findOne({
      where: { email: dto.from, tenantId },
    });
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
      steps.push(`Cliente nuevo creado: ${client.name}`);
    } else {
      steps.push(`Cliente identificado: ${client.name}`);
    }

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

    return { quote: saved, emailId: email.id, steps };
  }

  async generateAndSendPdf(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    const pdfBuffer = await this.pdfService.generateQuotePdf(quote);
    const pdfBase64 = pdfBuffer.toString('base64');
    quote.pdfUrl = `data:application/pdf;base64,${pdfBase64}`;
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
      return this.quoteRepository.save(quote);
    }

    quote.status = QuoteStatus.APPROVED;
    quote.approvedAt = new Date();
    quote.notes = inventoryChecks.allAvailable
      ? 'Todo en inventario. Listo para producción.'
      : `Inventario parcial. ${inventoryChecks.missing.map((m) => `${m.sku} falta ${m.missing}`).join(', ')}`;

    return this.quoteRepository.save(quote);
  }

  async rejectQuote(emailId: string, quoteId: string): Promise<Quote> {
    const email = await this.emailService.simulateClientRejection(emailId);
    if (!email) throw new NotFoundException('Email no encontrado');

    const quote = await this.findOne(quoteId);
    quote.status = QuoteStatus.REJECTED;
    quote.notes = 'Rechazada por el cliente.';
    return this.quoteRepository.save(quote);
  }

  async createPaymentLink(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    const link = await this.paymentService.createPaymentLink(
      quoteId,
      Number(quote.total),
    );
    quote.paymentLink = link.url;
    quote.status = QuoteStatus.PAYMENT_PENDING;
    return this.quoteRepository.save(quote);
  }

  async simulatePayment(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);

    if (quote.paymentLink) {
      const linkId = quote.paymentLink.split('/').pop()!;
      await this.paymentService.simulatePayment(linkId);
    }

    quote.status = QuoteStatus.PAID;
    quote.paidAt = new Date();
    quote.invoiceNumber = `FAC-${Date.now()}`;

    for (const item of quote.items || []) {
      if (item.product) {
        item.product.stock -= item.quantity;
        await this.productRepository.save(item.product);
      }
    }
    quote.client.usedCredit =
      Number(quote.client.usedCredit) + Number(quote.total);
    await this.clientRepository.save(quote.client);

    return this.quoteRepository.save(quote);
  }

  async moveToProduction(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    quote.status = QuoteStatus.IN_PRODUCTION;
    return this.quoteRepository.save(quote);
  }

  async markReady(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    quote.status = QuoteStatus.READY_FOR_DELIVERY;
    return this.quoteRepository.save(quote);
  }

  async markDelivered(quoteId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    quote.status = QuoteStatus.DELIVERED;
    quote.deliveredAt = new Date();
    return this.quoteRepository.save(quote);
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
