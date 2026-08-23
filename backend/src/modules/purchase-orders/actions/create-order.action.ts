import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../../../entities/order.entity';
import { OrderItem } from '../../../entities/order-item.entity';
import { Product } from '../../../entities/product.entity';
import {
  ActionExecutionRequest,
  ActionExecutionResult,
  ActionExecutor,
} from '../../document-flow/action-executor.types';

interface PurchaseOrderMetadata {
  poDocumentId: string;
  poNumber: string | null;
  items: Array<{ productId: string; quantity: number }>;
  reference: string | null;
}

/**
 * Acción "create_order": crea la Sales Order interna (`Order`) a partir de
 * los items ya validados de un `PurchaseOrderDocument`.
 *
 * Escribe directamente contra los repositorios (mismo efecto en BD que
 * `OrdersService.create`) en vez de inyectar `OrdersService` — `OrdersService`
 * depende de `TenantContext` (request-scoped), lo que volvería request-scoped
 * a esta acción y, en cascada, a `PurchaseOrdersDocumentFlowRegistration`;
 * un provider request-scoped nunca dispara `onModuleInit()` en el arranque
 * (no hay "request" todavía), así que los validadores nunca quedarían
 * registrados. El `tenantId` ya viaja en `DocumentFlowContext`, así que no
 * hace falta el servicio para tener aislamiento por tenant.
 */
@Injectable()
export class CreateOrderAction implements ActionExecutor {
  readonly type = 'create_order' as const;

  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async execute(
    request: ActionExecutionRequest,
  ): Promise<ActionExecutionResult> {
    const po = request.context.metadata?.purchaseOrder as
      | PurchaseOrderMetadata
      | undefined;
    const clientId = request.context.client?.id as string | undefined;
    const tenantId = request.context.tenantId;
    if (!po || !clientId || po.items.length === 0) {
      return {
        type: this.type,
        status: 'failed',
        message: 'Falta context.client o metadata.purchaseOrder.items para crear la orden',
      };
    }

    const savedOrder = await this.orders.save(
      this.orders.create({
        orderNumber: `OP-${po.poNumber ?? po.poDocumentId.slice(0, 8)}-${Date.now()}`,
        clientId,
        totalAmount: 0,
        status: OrderStatus.DRAFT,
        notes: [
          `Creada automáticamente desde PO ${po.poNumber ?? '(sin número)'}`,
          po.reference ? `Referencia: ${po.reference}` : null,
        ]
          .filter(Boolean)
          .join(' — '),
        tenantId,
      }),
    );

    let totalAmount = 0;
    for (const item of po.items) {
      const product = await this.products.findOne({
        where: { id: item.productId, tenantId },
      });
      if (!product) continue; // ya filtrado por products_valid antes de llegar aquí
      const totalPrice = Number(product.price) * item.quantity;
      await this.orderItems.save(
        this.orderItems.create({
          orderId: savedOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product.price,
          totalPrice,
          tenantId,
        }),
      );
      totalAmount += totalPrice;
    }

    savedOrder.totalAmount = totalAmount;
    await this.orders.save(savedOrder);

    return {
      type: this.type,
      status: 'executed',
      data: { orderId: savedOrder.id, orderNumber: savedOrder.orderNumber, totalAmount },
    };
  }
}
