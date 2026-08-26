import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Client } from '../../entities/client.entity';
import { Product } from '../../entities/product.entity';
import { Quote } from '../../entities/quote.entity';
import { Tenant } from '../../entities/tenant.entity';
import {
  PurchaseOrderDocument,
  PurchaseOrderDocumentStatus,
} from '../../entities/purchase-order-document.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { DocumentFlowEngine, DocumentFlowRuleResult } from '../document-flow/document-flow.engine';
import { DocumentFlowContext } from '../document-flow/document-flow-context.types';
import { ClassifierRegistry } from '../classification/classifier.registry';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { PurchaseOrderExtractor } from './purchase-order-extractor';
import { ProcessPurchaseOrderEmailDto } from './dto/process-purchase-order-email.dto';
import { ClassificationCategory, ClassificationResult } from '../classification/classification.types';

const WORKFLOW_NAME = 'purchase-order-to-cash';

export interface PurchaseOrderFlowResult {
  category: ClassificationCategory;
  classification: ClassificationResult;
  poDocument: PurchaseOrderDocument | null;
  ruleResult: DocumentFlowRuleResult | null;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(Client) private readonly clientRepository: Repository<Client>,
    @InjectRepository(Product) private readonly productRepository: Repository<Product>,
    @InjectRepository(Quote) private readonly quoteRepository: Repository<Quote>,
    @InjectRepository(Tenant) private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(PurchaseOrderDocument)
    private readonly poRepository: Repository<PurchaseOrderDocument>,
    private readonly ctx: TenantContext,
    private readonly engine: DocumentFlowEngine,
    private readonly classifiers: ClassifierRegistry,
    private readonly audit: WorkflowAuditService,
    private readonly extractor: PurchaseOrderExtractor,
  ) {}

  async processIncomingEmail(
    dto: ProcessPurchaseOrderEmailDto,
  ): Promise<PurchaseOrderFlowResult> {
    const tenantId = this.ctx.tenantId;

    if (!(await this.isEngineEnabled())) {
      throw new BadRequestException(
        'El Flujo 2 (Órdenes de Compra) no está habilitado para este tenant. ' +
          'Activa settings.documentFlowEngine.purchaseOrders para usarlo.',
      );
    }

    const senderDomain = (dto.from.split('@')[1] ?? '').toLowerCase().trim();
    const client = senderDomain
      ? await this.clientRepository.findOne({
          where: { email: ILike(`%@${senderDomain}`), tenantId },
        })
      : null;

    const classifier = await this.classifiers.resolve(tenantId);
    const classification = await classifier.classify({
      from: dto.from,
      subject: dto.subject,
      body: dto.body,
      attachments: dto.attachments,
      knownClient: client ? { isActive: client.isActive, name: client.name } : null,
    });

    if (classification.category !== 'purchase_order') {
      await this.audit.log({
        workflowName: WORKFLOW_NAME,
        action: 'email_classified_other_category',
        entityType: 'email',
        entityId: dto.from,
        outputData: { classification },
      });
      return {
        category: classification.category,
        classification,
        poDocument: null,
        ruleResult: null,
      };
    }

    const catalog = await this.productRepository.find({
      where: { isActive: true, tenantId },
    });
    const extracted = this.extractor.extract(dto.body, catalog);

    const quote = await this.locateRelatedQuote(client?.id ?? null, extracted.reference, tenantId);

    // Si la PO no repite producto/cantidad (ej. una simple respuesta
    // "acepto la cotización" en vez de un documento de PO formal), se toman
    // los items de la cotización relacionada en vez de rechazar la orden por
    // "sin productos identificados" — encontrado en vivo el 2026-08-26: el
    // extractor busca el mismo patrón SKU+cantidad que QuotesService, y una
    // aceptación real casi nunca repite esa info.
    const effectiveItems: Array<{ productId: string | null; quantity: number }> =
      extracted.items.length > 0
        ? extracted.items
        : (quote?.items ?? []).map((qi) => ({ productId: qi.productId, quantity: qi.quantity }));

    let estimatedTotal = 0;
    const orderItems: Array<{ productId: string; quantity: number }> = [];
    for (const item of effectiveItems) {
      if (!item.productId) continue;
      const product = catalog.find((p) => p.id === item.productId);
      if (!product) continue;
      estimatedTotal += Number(product.price) * item.quantity;
      orderItems.push({ productId: item.productId, quantity: item.quantity });
    }

    const poDocument = await this.poRepository.save(
      this.poRepository.create({
        tenantId,
        poNumber: extracted.poNumber,
        clientId: client?.id ?? null,
        senderEmail: dto.from,
        senderDomain,
        poDate: extracted.poDate,
        reference: extracted.reference,
        items: extracted.items,
        paymentTerms: extracted.paymentTerms,
        incoterm: extracted.incoterm,
        observations: extracted.observations,
        contactPerson: extracted.contactPerson,
        relatedQuoteId: quote?.id ?? null,
        status: PurchaseOrderDocumentStatus.RECEIVED,
        classification,
        rawEmailBody: dto.body,
      }),
    );

    const context: DocumentFlowContext = {
      tenantId,
      userId: this.ctx.userId,
      client: client
        ? {
            id: client.id,
            email: client.email,
            name: client.name,
            isActive: client.isActive,
            creditLimit: Number(client.creditLimit),
            usedCredit: Number(client.usedCredit),
          }
        : null,
      quote: quote
        ? {
            id: quote.id,
            quoteNumber: quote.quoteNumber,
            status: quote.status,
            validUntil: quote.validUntil,
          }
        : null,
      metadata: {
        purchaseOrder: {
          poDocumentId: poDocument.id,
          poNumber: extracted.poNumber,
          items: orderItems,
          estimatedTotal,
          reference: extracted.reference,
        },
        emailSubject: `Confirmación de Orden de Compra ${extracted.poNumber ?? ''}`.trim(),
        emailBody: `<p>Hemos recibido y procesado tu orden de compra${extracted.poNumber ? ` <b>${extracted.poNumber}</b>` : ''}.</p>`,
      },
    };

    const result = await this.engine.handle('PURCHASE_ORDER_RECEIVED', context);
    const ruleResult = result.rules[0] ?? null;
    if (!ruleResult) {
      throw new Error(
        'DocumentFlowEngine: no hay DocumentFlowRule activa para PURCHASE_ORDER_RECEIVED en este tenant. ' +
          'Crea una vía POST /document-flow/rules.',
      );
    }

    poDocument.validationResults = ruleResult.validations.map((v) => ({
      type: v.type,
      passed: v.passed,
      message: v.message,
    }));

    if (ruleResult.status === 'validation_failed') {
      poDocument.status = PurchaseOrderDocumentStatus.VALIDATION_FAILED;
      await this.poRepository.save(poDocument);
      await this.engine.handle('PURCHASE_ORDER_VALIDATION_FAILED', context);
      return { category: 'purchase_order', classification, poDocument, ruleResult };
    }

    const createOrderResult = ruleResult.actions.find((a) => a.type === 'create_order');
    const orderId = createOrderResult?.data?.orderId as string | undefined;
    poDocument.status = PurchaseOrderDocumentStatus.ORDER_CREATED;
    poDocument.createdOrderId = orderId ?? null;
    await this.poRepository.save(poDocument);
    await this.engine.handle('PURCHASE_ORDER_CREATED', context);

    return { category: 'purchase_order', classification, poDocument, ruleResult };
  }

  async findOne(id: string): Promise<PurchaseOrderDocument> {
    const doc = await this.poRepository.findOne({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!doc) throw new BadRequestException(`PurchaseOrderDocument ${id} no encontrado`);
    return doc;
  }

  async findAll(): Promise<PurchaseOrderDocument[]> {
    return this.poRepository.find({
      where: { tenantId: this.ctx.tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Por referencia explícita primero (ej. la PO cita el número de cotización); si no, la cotización más reciente del cliente. */
  private async locateRelatedQuote(
    clientId: string | null,
    reference: string | null,
    tenantId: string,
  ): Promise<Quote | null> {
    if (reference) {
      const byReference = await this.quoteRepository.findOne({
        where: { quoteNumber: reference, tenantId },
        relations: ['items'],
      });
      if (byReference) return byReference;
    }
    if (!clientId) return null;
    return this.quoteRepository.findOne({
      where: { clientId, tenantId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  private async isEngineEnabled(): Promise<boolean> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: this.ctx.tenantId },
    });
    const settings = tenant?.settings as
      | { documentFlowEngine?: Record<string, boolean> }
      | undefined;
    return settings?.documentFlowEngine?.purchaseOrders === true;
  }
}
