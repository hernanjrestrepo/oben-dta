import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { SeededRandom } from './prng';
import {
  buildClients,
  buildProducts,
  buildIncoterms,
  buildOrders,
  isInvoiceable,
  buildInvoice,
  buildCreditValidation,
  buildQuotes,
  isProductionEligible,
  buildProductionOrder,
  buildExportOperation,
  buildShipment,
  buildShipmentTracking,
  buildPackingList,
  ClientRef,
  ProductRef,
} from './dataset-builders';
import { GenerateDatasetDto, DatasetPreset } from './dto/generate-dataset.dto';
import { Client } from '../../entities/client.entity';
import { Product } from '../../entities/product.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Invoice } from '../../entities/invoice.entity';
import { CreditValidation } from '../../entities/credit-validation.entity';
import { Quote } from '../../entities/quote.entity';
import { QuoteItem } from '../../entities/quote-item.entity';
import { ProductionOrder } from '../../entities/production-order.entity';
import { Incoterm } from '../../entities/incoterm.entity';
import { ExportOperation } from '../../entities/export-operation.entity';
import { Shipment } from '../../entities/shipment.entity';
import { ShipmentTracking } from '../../entities/shipment-tracking.entity';
import { PackingList } from '../../entities/packing-list.entity';

interface Volumes {
  clients: number;
  products: number;
  orders: number;
  quotes: number;
  exportRatio: number;
}

export interface DatasetSummary {
  tenantId: string;
  seed: number;
  runTag: string;
  preset: DatasetPreset;
  clients: number;
  products: number;
  orders: number;
  orderItems: number;
  invoices: number;
  creditValidations: number;
  productionOrders: number;
  exportOperations: number;
  shipments: number;
  shipmentTracking: number;
  packingLists: number;
  quotes: number;
  quoteItems: number;
  elapsedMs: number;
}

const PRESETS: Record<DatasetPreset, { clients: number; products: number; orders: number }> = {
  // 'small' es para demos/QA rápidos y para no tumbar un servidor pequeño por accidente.
  small: { clients: 20, products: 50, orders: 100 },
  // 'full' son los mínimos exactos pedidos en la misión original.
  full: { clients: 500, products: 5000, orders: 20_000 },
};

const CHUNK_SIZE = 500;

/**
 * Genera un dataset semilla realista y coherente para un tenant, determinista
 * por seed. Todas las entidades quedan relacionadas entre sí (cliente real →
 * producto real → orden real → factura/validación de crédito/producción/
 * exportación/embarque/tracking/packing list reales, todas con FKs válidas).
 *
 * Es la ÚNICA fuente de datos sintéticos del sistema — nunca se genera desde
 * EVA, ADÁN ni el Integration Hub (esos siguen produciendo solo datos reales
 * o explícitamente 'pendiente_credenciales'). El dataset queda marcado con un
 * `runTag` en cada business-key (ej. `CLI-a3f9k2-00001`) para poder
 * distinguir siempre qué es dato sintético de QA vs dato transaccional real.
 */
@Injectable()
export class DatasetGeneratorService {
  private readonly logger = new Logger(DatasetGeneratorService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async generate(dto: GenerateDatasetDto): Promise<DatasetSummary> {
    const seed = dto.seed ?? 42;
    const preset: DatasetPreset = dto.preset ?? 'full';
    const volumes = this.resolveVolumes(dto, preset);
    const runTag = `${seed.toString(36)}${Date.now().toString(36).slice(-4)}`;
    const rng = new SeededRandom(seed);
    const tenantId = dto.tenantId;
    const startedAt = Date.now();

    this.logger.log(
      `Generando dataset tenant=${tenantId} seed=${seed} preset=${preset} runTag=${runTag} reset=${!!dto.reset}`,
    );

    if (dto.reset) {
      await this.resetTenantData(tenantId);
    }

    const incotermIds = await this.ensureIncoterms();

    const counts = {
      clients: 0, products: 0, orders: 0, orderItems: 0, invoices: 0,
      creditValidations: 0, productionOrders: 0, exportOperations: 0,
      shipments: 0, shipmentTracking: 0, packingLists: 0, quotes: 0, quoteItems: 0,
    };

    const clientRows = buildClients(rng, volumes.clients, runTag).map((c) => ({ ...c, tenantId }));
    const clientIds = await this.insertBatch(Client, clientRows);
    counts.clients = clientIds.length;
    const clientRefs: ClientRef[] = clientRows.map((c, i) => ({
      id: clientIds[i],
      creditLimit: c.creditLimit,
      usedCredit: c.usedCredit,
    }));

    const productRows = buildProducts(rng, volumes.products, runTag).map((p) => ({ ...p, tenantId }));
    const productIds = await this.insertBatch(Product, productRows);
    counts.products = productIds.length;
    const productRefs: ProductRef[] = productRows.map((p, i) => ({ id: productIds[i], price: p.price }));

    const orderPlans = buildOrders(rng, clientRefs, productRefs, volumes.orders, runTag);

    let invoiceSeq = 0;
    let cvSeq = 0;
    let poSeq = 0;
    let expSeq = 0;
    let shpSeq = 0;
    let plSeq = 0;

    for (let i = 0; i < orderPlans.length; i += CHUNK_SIZE) {
      const chunkPlans = orderPlans.slice(i, i + CHUNK_SIZE);
      const orderRows = chunkPlans.map((p) => ({ ...p.order, tenantId }));
      const orderIds = await this.insertBatch(Order, orderRows);
      counts.orders += orderIds.length;

      const itemRows: Record<string, unknown>[] = [];
      const invoiceRows: Record<string, unknown>[] = [];
      const cvRows: Record<string, unknown>[] = [];
      const poRows: Record<string, unknown>[] = [];
      const exportCandidates: Array<{
        input: ReturnType<typeof buildExportOperation>;
        orderItemCount: number;
      }> = [];

      chunkPlans.forEach((plan, idx) => {
        const orderId = orderIds[idx];
        for (const item of plan.items) {
          itemRows.push({ ...item, orderId, tenantId });
        }
        if (isInvoiceable(plan.order.status)) {
          invoiceRows.push({
            ...buildInvoice(
              rng,
              invoiceSeq++,
              { id: orderId, totalAmount: plan.order.totalAmount, status: plan.order.status, createdAt: plan.order.createdAt },
              runTag,
            ),
            tenantId,
          });
        }
        cvRows.push({
          ...buildCreditValidation(
            cvSeq++,
            { id: orderId, totalAmount: plan.order.totalAmount, createdAt: plan.order.createdAt },
            plan.clientSnapshot,
            runTag,
          ),
          tenantId,
        });
        if (isProductionEligible(plan.order.status) && plan.items.length > 0) {
          poRows.push({
            ...buildProductionOrder(
              rng,
              poSeq++,
              { id: orderId, status: plan.order.status, createdAt: plan.order.createdAt },
              plan.items[0],
              runTag,
            ),
            tenantId,
          });
        }
        if (plan.order.status === OrderStatus.DELIVERED && rng.bool(volumes.exportRatio)) {
          exportCandidates.push({
            input: buildExportOperation(
              rng,
              expSeq++,
              { id: orderId, clientId: plan.order.clientId, totalAmount: plan.order.totalAmount, createdAt: plan.order.createdAt },
              incotermIds,
              runTag,
            ),
            orderItemCount: plan.items.length,
          });
        }
      });

      if (itemRows.length) {
        await this.insertBatch(OrderItem, itemRows);
        counts.orderItems += itemRows.length;
      }
      if (invoiceRows.length) {
        await this.insertBatch(Invoice, invoiceRows);
        counts.invoices += invoiceRows.length;
      }
      if (cvRows.length) {
        await this.insertBatch(CreditValidation, cvRows);
        counts.creditValidations += cvRows.length;
      }
      if (poRows.length) {
        await this.insertBatch(ProductionOrder, poRows);
        counts.productionOrders += poRows.length;
      }

      if (exportCandidates.length) {
        const expRows = exportCandidates.map((e) => ({ ...e.input, tenantId }));
        const expIds = await this.insertBatch(ExportOperation, expRows);
        counts.exportOperations += expIds.length;

        const shipmentInputs = exportCandidates.map((e, idx) =>
          buildShipment(rng, shpSeq++, { ...e.input, id: expIds[idx] }, runTag),
        );
        const shipmentRows = shipmentInputs.map((s) => ({ ...s, tenantId }));
        const shipmentIds = await this.insertBatch(Shipment, shipmentRows);
        counts.shipments += shipmentIds.length;

        const trackingRows: Record<string, unknown>[] = [];
        shipmentInputs.forEach((s, idx) => {
          const events = buildShipmentTracking(rng, {
            id: shipmentIds[idx],
            status: s.status,
            createdAt: s.createdAt,
          });
          for (const ev of events) trackingRows.push({ ...ev, tenantId });
        });
        if (trackingRows.length) {
          await this.insertBatch(ShipmentTracking, trackingRows);
          counts.shipmentTracking += trackingRows.length;
        }

        const packingListRows = exportCandidates.map((e) => ({
          ...buildPackingList(rng, plSeq++, e.input, e.orderItemCount, runTag),
          tenantId,
        }));
        if (packingListRows.length) {
          await this.insertBatch(PackingList, packingListRows);
          counts.packingLists += packingListRows.length;
        }
      }
    }

    // Cotizaciones — flujo independiente de las órdenes, mismo pool de clientes/productos.
    const quotePlans = buildQuotes(rng, clientRefs, productRefs, volumes.quotes, runTag);
    for (let i = 0; i < quotePlans.length; i += CHUNK_SIZE) {
      const chunk = quotePlans.slice(i, i + CHUNK_SIZE);
      const quoteRows = chunk.map((q) => ({ ...q.quote, tenantId }));
      const quoteIds = await this.insertBatch(Quote, quoteRows);
      counts.quotes += quoteIds.length;

      const itemRows: Record<string, unknown>[] = [];
      chunk.forEach((q, idx) => {
        for (const item of q.items) {
          itemRows.push({ ...item, quoteId: quoteIds[idx], tenantId });
        }
      });
      if (itemRows.length) {
        await this.insertBatch(QuoteItem, itemRows);
        counts.quoteItems += itemRows.length;
      }
    }

    const summary: DatasetSummary = {
      tenantId,
      seed,
      runTag,
      preset,
      ...counts,
      elapsedMs: Date.now() - startedAt,
    };
    this.logger.log(`Dataset generado: ${JSON.stringify(summary)}`);
    return summary;
  }

  private resolveVolumes(dto: GenerateDatasetDto, preset: DatasetPreset): Volumes {
    const base = PRESETS[preset];
    const clients = dto.clients ?? base.clients;
    const products = dto.products ?? base.products;
    const orders = dto.orders ?? base.orders;
    return {
      clients,
      products,
      orders,
      quotes: Math.max(1, Math.round(orders * 0.1)),
      exportRatio: 0.05,
    };
  }

  /** Catálogo global (no tenant-scoped) — se siembra una sola vez, cualquier tenant lo comparte. */
  private async ensureIncoterms(): Promise<string[]> {
    const repo = this.dataSource.getRepository(Incoterm);
    const existing = await repo.find();
    if (existing.length >= 4) return existing.map((i) => i.id);

    const seedRows = buildIncoterms();
    const existingCodes = new Set(existing.map((e) => e.code));
    const toInsert = seedRows.filter((s) => !existingCodes.has(s.code));
    if (toInsert.length > 0) {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(Incoterm)
        .values(toInsert)
        .execute();
    }
    const all = await repo.find();
    return all.map((i) => i.id);
  }

  /**
   * Borra ÚNICAMENTE los datos del tenant indicado (jamás cruza tenants —
   * cada DELETE filtra por tenant_id). Acción destructiva explícita, solo se
   * ejecuta si el caller pasó `reset: true`.
   */
  private async resetTenantData(tenantId: string): Promise<void> {
    const tablesInDependencyOrder = [
      'shipment_tracking', 'shipments', 'packing_lists', 'export_operations',
      'production_orders', 'credit_validations', 'invoices', 'order_items',
      'orders', 'quote_items', 'quotes', 'products', 'clients',
    ];
    for (const table of tablesInDependencyOrder) {
      await this.dataSource.query(`DELETE FROM "${table}" WHERE tenant_id = $1`, [tenantId]);
    }
    this.logger.warn(`Datos reseteados para tenant=${tenantId} (tablas: ${tablesInDependencyOrder.join(', ')})`);
  }

  private async insertBatch<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    rows: Record<string, unknown>[],
    chunkSize = CHUNK_SIZE,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      if (chunk.length === 0) continue;
      const result = await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(entity)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values(chunk as any)
        .execute();
      for (const identifier of result.identifiers) {
        ids.push((identifier as { id: string }).id);
      }
    }
    return ids;
  }
}
