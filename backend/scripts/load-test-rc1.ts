/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { ContextIdFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { WorkflowEvent } from '../src/entities/workflow-event.entity';
import { QuotesService } from '../src/modules/quotes/quotes.service';
import { PurchaseOrdersService } from '../src/modules/purchase-orders/purchase-orders.service';
import { TenantContext } from '../src/common/tenant/tenant-context.service';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function stats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const total = times.reduce((a, b) => a + b, 0);
  return {
    count: times.length,
    totalMs: Math.round(total),
    avgMs: Math.round(total / (times.length || 1)),
    minMs: Math.round(sorted[0] ?? 0),
    maxMs: Math.round(sorted[sorted.length - 1] ?? 0),
    p50Ms: Math.round(percentile(sorted, 50)),
    p95Ms: Math.round(percentile(sorted, 95)),
    throughputPerSec: Number((times.length / (total / 1000)).toFixed(2)),
  };
}

function mem() {
  const m = process.memoryUsage();
  return {
    rssMB: Math.round(m.rss / 1024 / 1024),
    heapUsedMB: Math.round(m.heapUsed / 1024 / 1024),
  };
}

async function pgConnections(orders: Repository<Order>): Promise<number> {
  const rows = await orders.query(
    `SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database()`,
  );
  return rows[0].count;
}

async function run() {
  const report: Record<string, unknown> = {};
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const tenants = app.get<Repository<Tenant>>(getRepositoryToken(Tenant));
  const clients = app.get<Repository<Client>>(getRepositoryToken(Client));
  const products = app.get<Repository<Product>>(getRepositoryToken(Product));
  const quotes = app.get<Repository<Quote>>(getRepositoryToken(Quote));
  const quoteItems = app.get<Repository<QuoteItem>>(getRepositoryToken(QuoteItem));
  const orders = app.get<Repository<Order>>(getRepositoryToken(Order));
  const orderItems = app.get<Repository<OrderItem>>(getRepositoryToken(OrderItem));
  const poDocs = app.get<Repository<PurchaseOrderDocument>>(getRepositoryToken(PurchaseOrderDocument));
  const rules = app.get<Repository<DocumentFlowRule>>(getRepositoryToken(DocumentFlowRule));
  const workflowEvents = app.get<Repository<WorkflowEvent>>(getRepositoryToken(WorkflowEvent));

  const tenant = await tenants.findOne({ where: { slug: 'oben' } });
  if (!tenant) throw new Error('Tenant "oben" no existe');
  const originalSettings = tenant.settings;

  const client = await clients.findOne({ where: { tenantId: tenant.id, isActive: true } });
  const product = await products.findOne({ where: { tenantId: tenant.id, isActive: true } });
  if (!client || !product) throw new Error('Se requiere client/product activos sembrados');
  const originalCredit = { creditLimit: Number(client.creditLimit), usedCredit: Number(client.usedCredit) };
  client.creditLimit = 1_000_000_000_000;
  client.usedCredit = 0;
  await clients.save(client);

  const quoteRule = await rules.save(
    rules.create({
      tenantId: tenant.id,
      name: '[LOAD-TEST] Cotización → cliente',
      triggerEvent: 'QUOTE_REQUESTED',
      requiredDocuments: [{ key: 'quote_pdf', label: 'PDF', source: 'generated', required: true, sourceConfig: { generatorKey: 'quote_pdf' } }],
      recipients: [{ label: 'Cliente', to: ['{{client.email}}'] }],
      actions: [{ type: 'send_email', config: {} }],
      integrations: [], validations: [], priority: 100, status: DocumentFlowRuleStatus.ACTIVE,
    }),
  );
  const poRule = await rules.save(
    rules.create({
      tenantId: tenant.id,
      name: '[LOAD-TEST] PO → Sales Order',
      triggerEvent: 'PURCHASE_ORDER_RECEIVED',
      requiredDocuments: [],
      recipients: [{ label: 'Cliente', to: ['{{client.email}}'] }],
      actions: [{ type: 'create_order' }, { type: 'send_email', config: {} }],
      integrations: [],
      validations: [
        { type: 'client_exists' }, { type: 'domain_authorized' }, { type: 'quote_exists' },
        { type: 'quote_valid' }, { type: 'credit_limit' }, { type: 'products_valid' },
        { type: 'quantities_coherent' },
      ],
      priority: 100, status: DocumentFlowRuleStatus.ACTIVE,
    }),
  );

  tenant.settings = { ...(originalSettings ?? {}), documentFlowEngine: { quotes: true, purchaseOrders: true } };
  await tenants.save(tenant);

  const referenceQuote = await quotes.save(
    quotes.create({
      quoteNumber: `LOAD-REF-${Date.now()}`,
      clientId: client.id,
      status: 'SENT' as never,
      originalEmail: '[load-test] referencia', subtotal: 0, taxAmount: 0, total: 0, tenantId: tenant.id,
    }),
  );

  const domain = client.email.split('@')[1];
  const createdQuoteIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdPoDocIds: string[] = [];
  const errors: Array<{ phase: string; index: number; message: string }> = [];

  async function freshQuotesService(): Promise<QuotesService> {
    const contextId = ContextIdFactory.create();
    const ctx = await app.resolve(TenantContext, contextId);
    ctx.setContext(tenant!.id, null, false);
    return app.resolve(QuotesService, contextId);
  }
  async function freshPoService(): Promise<PurchaseOrdersService> {
    const contextId = ContextIdFactory.create();
    const ctx = await app.resolve(TenantContext, contextId);
    ctx.setContext(tenant!.id, null, false);
    return app.resolve(PurchaseOrdersService, contextId);
  }

  console.log('=== Baseline ===');
  const memBefore = mem();
  const connBefore = await pgConnections(orders);
  console.log(JSON.stringify({ memBefore, connBefore }));

  // ---- Fase A: 500 cotizaciones consecutivas ----
  console.log('=== Fase A: 500 cotizaciones consecutivas ===');
  const quoteTimes: number[] = [];
  for (let i = 0; i < 500; i++) {
    const t0 = Date.now();
    try {
      const svc = await freshQuotesService();
      const result = await svc.processIncomingEmail({
        from: `compras@${domain}`,
        subject: `Solicitud ${i}`,
        body: `Favor cotizar 1 ${product.name}`,
      });
      if (result.quote) createdQuoteIds.push(result.quote.id);
    } catch (e) {
      errors.push({ phase: 'quotes', index: i, message: e instanceof Error ? e.message : String(e) });
    }
    quoteTimes.push(Date.now() - t0);
    if ((i + 1) % 100 === 0) console.log(`  ... ${i + 1}/500`);
  }
  const memAfterA = mem();
  const connAfterA = await pgConnections(orders);

  // ---- Fase B: 500 órdenes de compra consecutivas ----
  console.log('=== Fase B: 500 órdenes de compra consecutivas ===');
  const poTimes: number[] = [];
  for (let i = 0; i < 500; i++) {
    const t0 = Date.now();
    try {
      const svc = await freshPoService();
      const result = await svc.processIncomingEmail({
        from: `compras@${domain}`,
        subject: `Orden de compra ${i}`,
        body: `Adjuntamos orden de compra PO-LOAD-${i}.\nReferencia: ${referenceQuote.quoteNumber}\n1 ${product.name}`,
      });
      if (result.poDocument) {
        createdPoDocIds.push(result.poDocument.id);
        if (result.poDocument.createdOrderId) createdOrderIds.push(result.poDocument.createdOrderId);
      }
    } catch (e) {
      errors.push({ phase: 'purchase_orders', index: i, message: e instanceof Error ? e.message : String(e) });
    }
    poTimes.push(Date.now() - t0);
    if ((i + 1) % 100 === 0) console.log(`  ... ${i + 1}/500`);
  }
  const memAfterB = mem();
  const connAfterB = await pgConnections(orders);

  // ---- Fase C: 20 flujos simultáneos (10 cotizaciones + 10 PO) ----
  console.log('=== Fase C: 20 flujos simultáneos ===');
  const concurrentStart = Date.now();
  const concurrentResults = await Promise.allSettled([
    ...Array.from({ length: 10 }, async (_, i) => {
      const svc = await freshQuotesService();
      return svc.processIncomingEmail({
        from: `compras@${domain}`,
        subject: `Concurrente cotización ${i}`,
        body: `Favor cotizar 1 ${product.name}`,
      });
    }),
    ...Array.from({ length: 10 }, async (_, i) => {
      const svc = await freshPoService();
      return svc.processIncomingEmail({
        from: `compras@${domain}`,
        subject: `Concurrente PO ${i}`,
        body: `Adjuntamos orden de compra PO-CONC-${i}.\nReferencia: ${referenceQuote.quoteNumber}\n1 ${product.name}`,
      });
    }),
  ]);
  const concurrentDurationMs = Date.now() - concurrentStart;
  const concurrentFailures = concurrentResults.filter((r) => r.status === 'rejected');
  for (const r of concurrentResults) {
    if (r.status === 'fulfilled') {
      const v = r.value as { quote?: { id: string }; poDocument?: { id: string; createdOrderId: string | null } };
      if (v.quote) createdQuoteIds.push(v.quote.id);
      if (v.poDocument) {
        createdPoDocIds.push(v.poDocument.id);
        if (v.poDocument.createdOrderId) createdOrderIds.push(v.poDocument.createdOrderId);
      }
    }
  }
  const memAfterC = mem();
  const connAfterC = await pgConnections(orders);

  // ---- Condiciones de carrera: unicidad de orderNumber (constraint real de BD) ----
  const distinctOrderNumbers = await orders.createQueryBuilder('o')
    .select('COUNT(DISTINCT o.orderNumber)', 'distinctCount')
    .addSelect('COUNT(*)', 'totalCount')
    .where('o.id IN (:...ids)', { ids: createdOrderIds.length ? createdOrderIds : ['00000000-0000-0000-0000-000000000000'] })
    .getRawOne();

  report.baseline = { memBefore, connBefore };
  report.phaseA_quotes = { stats: stats(quoteTimes), memAfter: memAfterA, connAfter: connAfterA, createdCount: createdQuoteIds.length };
  report.phaseB_purchaseOrders = { stats: stats(poTimes), memAfter: memAfterB, connAfter: connAfterB, createdOrders: createdOrderIds.length, createdPoDocs: createdPoDocIds.length };
  report.phaseC_concurrent20 = {
    totalDurationMs: concurrentDurationMs,
    failures: concurrentFailures.length,
    failureMessages: concurrentFailures.map((f) => (f as PromiseRejectedResult).reason?.message ?? String((f as PromiseRejectedResult).reason)),
    memAfter: memAfterC, connAfter: connAfterC,
  };
  report.raceConditionCheck = distinctOrderNumbers;
  report.errors = errors;
  report.errorCount = errors.length;
  report.memoryGrowthMB = { afterA: memAfterA.rssMB - memBefore.rssMB, afterB: memAfterB.rssMB - memBefore.rssMB, afterC: memAfterC.rssMB - memBefore.rssMB };
  report.connectionGrowth = { afterA: connAfterA - connBefore, afterB: connAfterB - connBefore, afterC: connAfterC - connBefore };

  console.log('=== REPORTE FINAL ===');
  console.log(JSON.stringify(report, null, 2));

  // ---- Limpieza ----
  console.log('=== Limpieza ===');
  for (const id of createdOrderIds) await orderItems.delete({ orderId: id });
  if (createdOrderIds.length) await orders.delete(createdOrderIds);
  for (const id of createdPoDocIds) await poDocs.delete({ id });
  if (createdQuoteIds.length) {
    for (const id of createdQuoteIds) await quoteItems.delete({ quoteId: id });
    await quotes.delete(createdQuoteIds);
  }
  await quotes.delete({ id: referenceQuote.id });
  await rules.delete({ id: quoteRule.id });
  await rules.delete({ id: poRule.id });
  client.creditLimit = originalCredit.creditLimit;
  client.usedCredit = originalCredit.usedCredit;
  await clients.save(client);
  tenant.settings = originalSettings;
  await tenants.save(tenant);
  console.log('Limpieza completa.');

  await app.close();
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
