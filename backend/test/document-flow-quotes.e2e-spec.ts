import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ContextIdFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Tenant } from '../src/entities/tenant.entity';
import { Client } from '../src/entities/client.entity';
import { Product } from '../src/entities/product.entity';
import { Quote, QuoteStatus } from '../src/entities/quote.entity';
import { QuoteItem } from '../src/entities/quote-item.entity';
import {
  DocumentFlowRule,
  DocumentFlowRuleStatus,
} from '../src/entities/document-flow-rule.entity';
import { WorkflowEvent } from '../src/entities/workflow-event.entity';
import { QuotesService } from '../src/modules/quotes/quotes.service';
import { TenantContext } from '../src/common/tenant/tenant-context.service';
import { IntegrationHubService } from '../src/modules/integrations/hub/integration-hub.service';

/**
 * Prueba de fuego pedida para Fase 2 / Flujo 1: demuestra, contra la BD real
 * (la misma que usa el contenedor dta-backend), que el flujo de Solicitud de
 * Cotización puede ejecutarse íntegramente a través del DocumentFlowEngine
 * — regla resuelta, PDF generado por QuotePdfService, correo enviado por el
 * Integration Hub, auditoría escrita por WorkflowAuditService — sin mocks.
 *
 * No corre en `npm test` (solo en `npm run test:e2e`): requiere Postgres real.
 */
jest.setTimeout(30000);

describe('DocumentFlowEngine — flujo de Solicitud de Cotización (e2e, BD real)', () => {
  let app: INestApplication;
  let tenants: Repository<Tenant>;
  let clients: Repository<Client>;
  let products: Repository<Product>;
  let quotes: Repository<Quote>;
  let quoteItems: Repository<QuoteItem>;
  let rules: Repository<DocumentFlowRule>;
  let workflowEvents: Repository<WorkflowEvent>;

  let obenTenant: Tenant;
  let originalSettings: Record<string, unknown>;
  let createdRuleId: string;
  let createdQuoteId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    tenants = app.get(getRepositoryToken(Tenant));
    clients = app.get(getRepositoryToken(Client));
    products = app.get(getRepositoryToken(Product));
    quotes = app.get(getRepositoryToken(Quote));
    quoteItems = app.get(getRepositoryToken(QuoteItem));
    rules = app.get(getRepositoryToken(DocumentFlowRule));
    workflowEvents = app.get(getRepositoryToken(WorkflowEvent));

    const found = await tenants.findOne({ where: { slug: 'oben' } });
    if (!found) throw new Error('Tenant "oben" no existe en esta BD — abortando.');
    obenTenant = found;
    originalSettings = obenTenant.settings;
  });

  afterAll(async () => {
    // Deja la BD exactamente como estaba.
    if (createdQuoteId) {
      await quoteItems.delete({ quoteId: createdQuoteId });
      await quotes.delete({ id: createdQuoteId });
    }
    if (createdRuleId) {
      await rules.delete({ id: createdRuleId });
    }
    obenTenant.settings = originalSettings;
    await tenants.save(obenTenant);
    await app.close();
  });

  it('QUOTE_REQUESTED: resuelve la regla, genera el PDF real, envía el correo real y audita — todo vía el motor', async () => {
    // 1) Arreglo: cliente y producto reales del tenant (los que ya siembra el
    //    dataset de piloto), una DocumentFlowRule para QUOTE_REQUESTED, y la
    //    bandera del tenant encendida.
    const client = await clients.findOne({ where: { tenantId: obenTenant.id } });
    const product = await products.findOne({ where: { tenantId: obenTenant.id } });
    if (!client || !product) {
      throw new Error('Se requiere al menos un client y un product sembrados para el tenant "oben".');
    }

    const rule = await rules.save(
      rules.create({
        tenantId: obenTenant.id,
        name: '[E2E] Cotización → cliente',
        triggerEvent: 'QUOTE_REQUESTED',
        requiredDocuments: [
          {
            key: 'quote_pdf',
            label: 'PDF de cotización',
            source: 'generated',
            required: true,
            sourceConfig: { generatorKey: 'quote_pdf' },
          },
        ],
        recipients: [{ label: 'Cliente', to: ['{{client.email}}'] }],
        actions: [{ type: 'send_email', config: {} }],
        integrations: [],
        validations: [],
        priority: 100,
        status: DocumentFlowRuleStatus.ACTIVE,
      }),
    );
    createdRuleId = rule.id;

    obenTenant.settings = {
      ...(originalSettings ?? {}),
      documentFlowEngine: { quotes: true },
    };
    await tenants.save(obenTenant);

    const quantity = 3;
    const totalPrice = Number(product.price) * quantity;
    const quote = await quotes.save(
      quotes.create({
        quoteNumber: `E2E-${Date.now()}`,
        clientId: client.id,
        status: QuoteStatus.QUOTED,
        originalEmail: '[e2e] correo de prueba',
        subtotal: totalPrice,
        taxAmount: totalPrice * 0.19,
        total: totalPrice * 1.19,
        tenantId: obenTenant.id,
      }),
    );
    createdQuoteId = quote.id;
    await quoteItems.save(
      quoteItems.create({
        quoteId: quote.id,
        productId: product.id,
        quantity,
        unitPrice: Number(product.price),
        totalPrice,
        tenantId: obenTenant.id,
      }),
    );

    // 2) Acto: resolver QuotesService y TenantContext EN EL MISMO contexto de
    //    request-scope (sin HTTP/JWT), y ejecutar el método público real que
    //    ahora rama hacia el motor.
    const contextId = ContextIdFactory.create();
    const tenantContext = await app.resolve(TenantContext, contextId);
    tenantContext.setContext(obenTenant.id, null, false);
    const quotesService = await app.resolve(QuotesService, contextId);
    const hub = await app.resolve(IntegrationHubService, contextId);

    const before = Date.now();
    const result = await quotesService.generateAndSendPdf(quote.id);

    // 3) Evidencia — el mismo resultado visible de siempre (API pública, PDF,
    //    modelo de datos intactos):
    expect(result.status).toBe(QuoteStatus.SENT);
    expect(result.pdfUrl).toMatch(/^data:application\/pdf;base64,/);
    const pdfBytes = Buffer.from(
      result.pdfUrl!.replace('data:application/pdf;base64,', ''),
      'base64',
    );
    expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF'); // PDF real, no un stub.

    // 4) Evidencia — el envío realmente pasó por el Hub (EmailMockAdapter):
    const outbox = await hub.call<{ messages: Array<{ to: string; subject: string }> }>(
      'email',
      'outbox.list',
      {},
    );
    const sentToClient = outbox.data?.messages.find((m) =>
      m.to.includes(client.email),
    );
    expect(sentToClient).toBeDefined();

    // 5) Evidencia — la auditoría la escribió el motor (workflow_events,
    //    workflowName='document_flow'), no el código legado
    //    (workflowName='quote-to-cash'):
    const auditRows = await workflowEvents.find({
      where: { tenantId: obenTenant.id, entityId: rule.id },
      order: { createdAt: 'DESC' },
    });
    const engineAudit = auditRows.find(
      (e) => e.workflowName === 'document_flow' && e.createdAt.getTime() >= before - 1000,
    );
    expect(engineAudit).toBeDefined();
    expect(engineAudit!.action).toBe('QUOTE_REQUESTED');
    expect(engineAudit!.outputData).toMatchObject({ status: 'completed' });
  }, 30000);
});
