import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Tenant } from '../src/entities/tenant.entity';
import { Client } from '../src/entities/client.entity';
import { Product } from '../src/entities/product.entity';
import { Quote } from '../src/entities/quote.entity';
import { QuoteItem } from '../src/entities/quote-item.entity';
import { Order } from '../src/entities/order.entity';
import { OrderItem } from '../src/entities/order-item.entity';
import { PurchaseOrderDocument } from '../src/entities/purchase-order-document.entity';
import {
  DocumentFlowRule,
  DocumentFlowRuleStatus,
} from '../src/entities/document-flow-rule.entity';
import { IdempotencyRecord } from '../src/entities/idempotency-record.entity';
import { LicensingService } from '../src/modules/security/licensing.service';

jest.setTimeout(60000);

/**
 * Prueba de fuego de WO-018 Sprint 4 (idempotencia) contra Postgres real y
 * por HTTP real (el `IdempotencyInterceptor` vive en esa capa) — no basta
 * con probar el servicio en aislamiento.
 *
 * Firma un JWT propio con el mismo `JWT_SECRET` del servidor para pasar los
 * guards como `admin@oben.com` (ya tiene los permisos reales en BD) — no es
 * la contraseña de nadie, es la misma clave de firma que ya vengo usando
 * para configurar este entorno de pruebas.
 */
describe('Idempotencia — mismo correo dos veces (e2e, HTTP real, BD real)', () => {
  let app: INestApplication;
  let tenants: Repository<Tenant>;
  let clients: Repository<Client>;
  let products: Repository<Product>;
  let quotes: Repository<Quote>;
  let quoteItems: Repository<QuoteItem>;
  let orders: Repository<Order>;
  let orderItems: Repository<OrderItem>;
  let poDocuments: Repository<PurchaseOrderDocument>;
  let rules: Repository<DocumentFlowRule>;
  let idempotencyRecords: Repository<IdempotencyRecord>;

  let obenTenant: Tenant;
  let originalSettings: Record<string, unknown>;
  let client: Client;
  let originalClientCredit: { creditLimit: number; usedCredit: number };
  let product: Product;
  let quoteRule: DocumentFlowRule;
  let poRule: DocumentFlowRule;
  let token: string;

  const createdQuoteIds: string[] = [];
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
    quoteItems = app.get(getRepositoryToken(QuoteItem));
    orders = app.get(getRepositoryToken(Order));
    orderItems = app.get(getRepositoryToken(OrderItem));
    poDocuments = app.get(getRepositoryToken(PurchaseOrderDocument));
    rules = app.get(getRepositoryToken(DocumentFlowRule));
    idempotencyRecords = app.get(getRepositoryToken(IdempotencyRecord));

    const found = await tenants.findOne({ where: { slug: 'oben' } });
    if (!found) throw new Error('Tenant "oben" no existe — abortando.');
    obenTenant = found;
    originalSettings = obenTenant.settings;

    const foundClient = await clients.findOne({ where: { tenantId: obenTenant.id } });
    const foundProduct = await products.findOne({ where: { tenantId: obenTenant.id, isActive: true } });
    if (!foundClient || !foundProduct) throw new Error('Se requiere client y product activos.');
    client = foundClient;
    product = foundProduct;
    originalClientCredit = { creditLimit: Number(client.creditLimit), usedCredit: Number(client.usedCredit) };
    client.creditLimit = 1_000_000_000;
    client.usedCredit = 0;
    await clients.save(client);

    quoteRule = await rules.save(
      rules.create({
        tenantId: obenTenant.id,
        name: '[E2E-idempotencia] Cotización',
        triggerEvent: 'QUOTE_REQUESTED',
        requiredDocuments: [
          { key: 'quote_pdf', label: 'PDF', source: 'generated', required: true, sourceConfig: { generatorKey: 'quote_pdf' } },
        ],
        recipients: [{ label: 'Cliente', to: ['{{client.email}}'] }],
        actions: [{ type: 'send_email', config: {} }],
        integrations: [],
        validations: [],
        priority: 100,
        status: DocumentFlowRuleStatus.ACTIVE,
      }),
    );
    poRule = await rules.save(
      rules.create({
        tenantId: obenTenant.id,
        name: '[E2E-idempotencia] Orden de Compra',
        triggerEvent: 'PURCHASE_ORDER_RECEIVED',
        requiredDocuments: [],
        recipients: [{ label: 'Cliente', to: ['{{client.email}}'] }],
        actions: [{ type: 'create_order' }, { type: 'send_email', config: {} }],
        integrations: [],
        validations: [
          { type: 'client_exists' }, { type: 'domain_authorized' }, { type: 'quote_exists' },
          { type: 'quote_valid' }, { type: 'credit_limit' }, { type: 'products_valid' }, { type: 'quantities_coherent' },
        ],
        priority: 100,
        status: DocumentFlowRuleStatus.ACTIVE,
      }),
    );

    obenTenant.settings = {
      ...(originalSettings ?? {}),
      documentFlowEngine: { quotes: true, purchaseOrders: true },
    };
    await tenants.save(obenTenant);

    // Las claves de firma de licencia son efímeras por proceso cuando
    // LICENSE_SIGNING_PRIVATE_KEY/PUBLIC_KEY no están en el entorno (ver
    // WO-018 Sprint 1, "Riesgo #6") — la firma de una licencia emitida en un
    // boot anterior no valida contra la clave nueva de ESTE proceso. Se
    // reemite aquí mismo, con el propio `LicensingService` de la app, para
    // que quede firmada con la clave que este proceso realmente tiene cargada.
    const licensing = app.get(LicensingService);
    await licensing.renew(obenTenant.id, { durationDays: 7 });

    token = jwt.sign(
      {
        sub: 'cabbb822-015c-4726-b4cc-e3dce075cd04',
        email: 'admin@oben.com',
        role: 'sales',
        tenantId: obenTenant.id,
        tenantSlug: 'oben',
        isSuperAdmin: false,
        ver: 0,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    for (const orderId of createdOrderIds) {
      await orderItems.delete({ orderId });
      await orders.delete({ id: orderId });
    }
    for (const id of createdPoDocIds) await poDocuments.delete({ id });
    for (const id of createdQuoteIds) {
      await quoteItems.delete({ quoteId: id });
      await quotes.delete({ id });
    }
    await rules.delete({ id: quoteRule.id });
    await rules.delete({ id: poRule.id });
    await idempotencyRecords.delete({ tenantId: obenTenant.id, eventType: 'quote_email' });
    await idempotencyRecords.delete({ tenantId: obenTenant.id, eventType: 'purchase_order_email' });
    client.creditLimit = originalClientCredit.creditLimit;
    client.usedCredit = originalClientCredit.usedCredit;
    await clients.save(client);
    obenTenant.settings = originalSettings;
    await tenants.save(obenTenant);
    await app.close();
  });

  it('correo de SOLICITUD DE COTIZACIÓN enviado dos veces (mismo Message-ID) → una sola cotización', async () => {
    const messageId = `<idem-quote-${Date.now()}@test>`;
    const body = { from: client.email, subject: 'Cotización', body: `Favor cotizar 2 ${product.name}`, messageId };

    const before = await quotes.count({ where: { tenantId: obenTenant.id } });

    const r1 = await request(app.getHttpServer())
      .post('/quotes/email')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(r1.status).toBe(201);
    if (r1.body.quote?.id) createdQuoteIds.push(r1.body.quote.id);

    const r2 = await request(app.getHttpServer())
      .post('/quotes/email')
      .set('Authorization', `Bearer ${token}`)
      .send(body); // MISMO Message-ID, MISMO contenido

    const after = await quotes.count({ where: { tenantId: obenTenant.id } });

    expect(after).toBe(before + 1); // no +2
    expect(r2.status).toBe(201); // segunda respuesta = resultado guardado, no error
    expect(r2.body).toEqual(r1.body); // idéntico al primero, no se re-ejecutó nada
  });

  it('correo de ORDEN DE COMPRA enviado dos veces (sin Message-ID, mismo contenido → mismo hash) → una sola PurchaseOrderDocument y una sola Orden', async () => {
    const body = {
      from: client.email,
      subject: 'Orden de compra',
      body: `Adjuntamos orden de compra PO-IDEM-${Date.now()}.\n1 ${product.name}`,
    };

    const beforePo = await poDocuments.count({ where: { tenantId: obenTenant.id } });
    const beforeOrders = await orders.count({ where: { tenantId: obenTenant.id } });

    const r1 = await request(app.getHttpServer())
      .post('/purchase-orders/email')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(r1.status).toBe(201);
    if (r1.body.poDocument?.id) createdPoDocIds.push(r1.body.poDocument.id);
    if (r1.body.poDocument?.createdOrderId) createdOrderIds.push(r1.body.poDocument.createdOrderId);

    const r2 = await request(app.getHttpServer())
      .post('/purchase-orders/email')
      .set('Authorization', `Bearer ${token}`)
      .send(body); // MISMO contenido exacto → mismo hash sha256

    const afterPo = await poDocuments.count({ where: { tenantId: obenTenant.id } });
    const afterOrders = await orders.count({ where: { tenantId: obenTenant.id } });

    expect(afterPo).toBe(beforePo + 1);
    expect(afterOrders).toBe(beforeOrders + 1);
    expect(r2.status).toBe(201);
    expect(r2.body).toEqual(r1.body);
  });

  it('bajo concurrencia real (15 requests simultáneas, mismo correo) → una sola cotización, sin condición de carrera', async () => {
    const body = {
      from: client.email,
      subject: 'Cotización concurrente',
      body: `Favor cotizar 1 ${product.name} — prueba de concurrencia ${Date.now()}`,
    };
    const before = await quotes.count({ where: { tenantId: obenTenant.id } });

    const responses = await Promise.all(
      Array.from({ length: 15 }, () =>
        request(app.getHttpServer())
          .post('/quotes/email')
          .set('Authorization', `Bearer ${token}`)
          .send(body),
      ),
    );

    const after = await quotes.count({ where: { tenantId: obenTenant.id } });
    expect(after).toBe(before + 1); // exactamente 1, sin importar cuántas de las 15 llegaron "al mismo tiempo"

    const succeeded = responses.filter((r) => r.status === 201);
    const conflicted = responses.filter((r) => r.status === 409);
    expect(succeeded.length + conflicted.length).toBe(15);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    const successfulQuoteIds = new Set(succeeded.map((r) => r.body.quote?.id).filter(Boolean));
    expect(successfulQuoteIds.size).toBe(1); // todas las respuestas 201 devuelven LA MISMA cotización
    for (const id of successfulQuoteIds) createdQuoteIds.push(id as string);
  });
});
