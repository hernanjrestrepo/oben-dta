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
import { Order } from '../src/entities/order.entity';
import { OrderItem } from '../src/entities/order-item.entity';
import {
  PurchaseOrderDocument,
  PurchaseOrderDocumentStatus,
} from '../src/entities/purchase-order-document.entity';
import {
  DocumentFlowRule,
  DocumentFlowRuleStatus,
} from '../src/entities/document-flow-rule.entity';
import { WorkflowEvent } from '../src/entities/workflow-event.entity';
import { PurchaseOrdersService } from '../src/modules/purchase-orders/purchase-orders.service';
import { TenantContext } from '../src/common/tenant/tenant-context.service';

jest.setTimeout(30000);

/**
 * Prueba de fuego de WO-017 (Flujo 2 — Órdenes de Compra) contra la BD real
 * (la misma que usa el contenedor dta-backend). Dos escenarios:
 *   A) PO de un cliente conocido, con cotización y cupo suficiente → el
 *      motor completa las 7 validaciones y crea una Sales Order real.
 *   B) PO de un remitente desconocido → varias validaciones fallan, el
 *      motor NO ejecuta `create_order` — cero filas creadas.
 *
 * No corre en `npm test` (solo en `npm run test:e2e`): requiere Postgres real.
 */
describe('DocumentFlowEngine — flujo de Órdenes de Compra (e2e, BD real)', () => {
  let app: INestApplication;
  let tenants: Repository<Tenant>;
  let clients: Repository<Client>;
  let products: Repository<Product>;
  let quotes: Repository<Quote>;
  let orders: Repository<Order>;
  let orderItems: Repository<OrderItem>;
  let poDocuments: Repository<PurchaseOrderDocument>;
  let rules: Repository<DocumentFlowRule>;
  let workflowEvents: Repository<WorkflowEvent>;

  let obenTenant: Tenant;
  let originalSettings: Record<string, unknown>;
  let client: Client;
  let originalClientCredit: { creditLimit: number; usedCredit: number };
  let product: Product;
  let quote: Quote;
  let rule: DocumentFlowRule;

  const createdOrderIds: string[] = [];
  const createdPoDocIds: string[] = [];

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
    orders = app.get(getRepositoryToken(Order));
    orderItems = app.get(getRepositoryToken(OrderItem));
    poDocuments = app.get(getRepositoryToken(PurchaseOrderDocument));
    rules = app.get(getRepositoryToken(DocumentFlowRule));
    workflowEvents = app.get(getRepositoryToken(WorkflowEvent));

    const found = await tenants.findOne({ where: { slug: 'oben' } });
    if (!found) throw new Error('Tenant "oben" no existe en esta BD — abortando.');
    obenTenant = found;
    originalSettings = obenTenant.settings;

    const foundClient = await clients.findOne({ where: { tenantId: obenTenant.id } });
    const foundProduct = await products.findOne({ where: { tenantId: obenTenant.id, isActive: true } });
    if (!foundClient || !foundProduct) {
      throw new Error('Se requiere al menos un client y un product ACTIVO sembrados para el tenant "oben".');
    }
    client = foundClient;
    product = foundProduct;
    originalClientCredit = { creditLimit: Number(client.creditLimit), usedCredit: Number(client.usedCredit) };

    // Cupo suficiente para el escenario A, determinístico.
    client.creditLimit = 1_000_000_000;
    client.usedCredit = 0;
    await clients.save(client);

    quote = await quotes.save(
      quotes.create({
        quoteNumber: `E2E-PO-${Date.now()}`,
        clientId: client.id,
        status: QuoteStatus.SENT,
        originalEmail: '[e2e] cotización de referencia',
        subtotal: 0,
        taxAmount: 0,
        total: 0,
        tenantId: obenTenant.id,
      }),
    );

    rule = await rules.save(
      rules.create({
        tenantId: obenTenant.id,
        name: '[E2E] Orden de Compra → Sales Order',
        triggerEvent: 'PURCHASE_ORDER_RECEIVED',
        requiredDocuments: [],
        recipients: [{ label: 'Cliente', to: ['{{client.email}}'] }],
        actions: [{ type: 'create_order' }, { type: 'send_email', config: {} }],
        integrations: [],
        validations: [
          { type: 'client_exists' },
          { type: 'domain_authorized' },
          { type: 'quote_exists' },
          { type: 'quote_valid' },
          { type: 'credit_limit' },
          { type: 'products_valid' },
          { type: 'quantities_coherent' },
        ],
        priority: 100,
        status: DocumentFlowRuleStatus.ACTIVE,
      }),
    );

    obenTenant.settings = {
      ...(originalSettings ?? {}),
      documentFlowEngine: { purchaseOrders: true },
    };
    await tenants.save(obenTenant);
  });

  afterAll(async () => {
    for (const orderId of createdOrderIds) {
      await orderItems.delete({ orderId });
      await orders.delete({ id: orderId });
    }
    for (const id of createdPoDocIds) {
      await poDocuments.delete({ id });
    }
    if (rule) await rules.delete({ id: rule.id });
    if (quote) await quotes.delete({ id: quote.id });
    client.creditLimit = originalClientCredit.creditLimit;
    client.usedCredit = originalClientCredit.usedCredit;
    await clients.save(client);
    obenTenant.settings = originalSettings;
    await tenants.save(obenTenant);
    await app.close();
  });

  function resolvePoService() {
    const contextId = ContextIdFactory.create();
    return (async () => {
      const tenantContext = await app.resolve(TenantContext, contextId);
      tenantContext.setContext(obenTenant.id, null, false);
      return app.resolve(PurchaseOrdersService, contextId);
    })();
  }

  it('A) PO de cliente conocido + cotización + cupo suficiente → las 7 validaciones pasan y se crea la Sales Order real', async () => {
    const domain = client.email.split('@')[1];
    const poNumber = `E2E-${Date.now()}`;
    const body = [
      `Adjuntamos orden de compra PO-${poNumber}.`,
      `Referencia: ${quote.quoteNumber}`,
      `1 ${product.name}`,
      'Condiciones de pago: contado',
      'Incoterm: FOB',
    ].join('\n');

    const poService = await resolvePoService();
    const before = Date.now();
    const result = await poService.processIncomingEmail({
      from: `compras@${domain}`,
      subject: 'Orden de compra',
      body,
    });

    expect(result.category).toBe('purchase_order');
    expect(result.classification.provider).toBe('rules');
    expect(result.poDocument).not.toBeNull();
    createdPoDocIds.push(result.poDocument!.id);

    // Evidencia — regla resuelta y las 7 validaciones en verde:
    expect(result.ruleResult!.ruleId).toBe(rule.id);
    expect(result.ruleResult!.status).toBe('completed');
    expect(result.ruleResult!.validationsPassed).toBe(true);
    expect(result.ruleResult!.validations).toHaveLength(7);
    expect(result.ruleResult!.validations.every((v) => v.passed)).toBe(true);

    // Evidencia — Orden real creada (no un resultado simulado):
    expect(result.poDocument!.status).toBe(PurchaseOrderDocumentStatus.ORDER_CREATED);
    expect(result.poDocument!.createdOrderId).toBeTruthy();
    createdOrderIds.push(result.poDocument!.createdOrderId!);
    const orderRow = await orders.findOne({
      where: { id: result.poDocument!.createdOrderId! },
      relations: ['items'],
    });
    expect(orderRow).not.toBeNull();
    expect(orderRow!.items.some((i) => i.productId === product.id)).toBe(true);

    // Evidencia — auditoría real del motor, con trazas de observabilidad:
    const auditRows = await workflowEvents.find({
      where: { tenantId: obenTenant.id, entityId: rule.id },
      order: { createdAt: 'DESC' },
    });
    const receivedAudit = auditRows.find(
      (e) => e.action === 'PURCHASE_ORDER_RECEIVED' && e.createdAt.getTime() >= before - 1000,
    );
    expect(receivedAudit).toBeDefined();
    expect(receivedAudit!.outputData).toMatchObject({ status: 'completed' });
    const output = receivedAudit!.outputData as Record<string, unknown>;
    expect(Array.isArray(output.validationsTrace)).toBe(true);
    expect((output.validationsTrace as unknown[]).length).toBe(7);
    expect(output.actionsUsed).toEqual(['create_order', 'send_email']);
  });

  it('B) PO de remitente desconocido → varias validaciones fallan, NO se crea ninguna Orden', async () => {
    const ordersCountBefore = await orders.count({ where: { tenantId: obenTenant.id } });

    const body = [
      'Adjuntamos orden de compra PO-DESCONOCIDA-999.',
      'Sin referencia a cotización previa.',
    ].join('\n');

    const poService = await resolvePoService();
    const result = await poService.processIncomingEmail({
      from: 'compras@dominio-que-no-existe-en-oben.test',
      subject: 'Orden de compra',
      body,
    });

    expect(result.category).toBe('purchase_order');
    expect(result.poDocument).not.toBeNull();
    createdPoDocIds.push(result.poDocument!.id);

    expect(result.ruleResult!.status).toBe('validation_failed');
    expect(result.ruleResult!.validationsPassed).toBe(false);
    // Al menos cliente/dominio/cotización/productos deben fallar con remitente desconocido.
    expect(result.ruleResult!.failedValidations).toEqual(
      expect.arrayContaining(['client_exists', 'domain_authorized', 'quote_exists']),
    );
    expect(result.poDocument!.status).toBe(PurchaseOrderDocumentStatus.VALIDATION_FAILED);
    expect(result.poDocument!.createdOrderId).toBeNull();

    const ordersCountAfter = await orders.count({ where: { tenantId: obenTenant.id } });
    expect(ordersCountAfter).toBe(ordersCountBefore); // cero resultados parciales
  });
});
