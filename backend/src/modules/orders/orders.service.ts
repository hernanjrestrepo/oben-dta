import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Client } from '../../entities/client.entity';
import { Product } from '../../entities/product.entity';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { UserRole } from '../auth/dto/auth.dto';

export interface RequestingUser {
  sub: string;
  role: UserRole;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  async create(dto: CreateOrderDto, userId?: string): Promise<Order> {
    // Verify client exists
    const client = await this.clientRepository.findOne({
      where: { id: dto.clientId },
    });
    if (!client) {
      throw new NotFoundException(`Cliente ${dto.clientId} no encontrado`);
    }

    // Create the order first (without items) so we have an order_id
    const order = this.orderRepository.create({
      orderNumber: dto.orderNumber,
      notes: dto.notes,
      totalAmount: 0,
      client,
      clientId: client.id,
      status: OrderStatus.DRAFT,
      createdBy: userId,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Create and save order items explicitly with the real order_id
    const items: OrderItem[] = [];
    let totalAmount = 0;

    for (const itemDto of dto.items || []) {
      const product = await this.productRepository.findOne({
        where: { id: itemDto.productId },
      });
      if (!product) {
        throw new NotFoundException(
          `Producto ${itemDto.productId} no encontrado`,
        );
      }

      const item = this.orderItemRepository.create({
        order: savedOrder,
        orderId: savedOrder.id,
        productId: itemDto.productId,
        quantity: itemDto.quantity,
        unitPrice: product.price,
        totalPrice: product.price * itemDto.quantity,
      });

      const savedItem = await this.orderItemRepository.save(item);
      items.push(savedItem);
      totalAmount += savedItem.totalPrice;
    }

    // Update order total
    savedOrder.totalAmount = totalAmount;
    savedOrder.items = items;
    await this.orderRepository.save(savedOrder);

    // Return with full relations loaded
    const result = await this.orderRepository.findOne({
      where: { id: savedOrder.id },
      relations: ['client', 'items', 'items.product'],
    });
    if (!result) {
      throw new NotFoundException(`Orden ${savedOrder.id} no encontrada después de crear`);
    }
    return result;
  }

  async findAll(userId?: string, page: number = 1, limit: number = 50): Promise<Order[]> {
    const where: any = {};
    if (userId) {
      where.createdBy = userId;
    }
    return this.orderRepository.find({
      where,
      relations: ['client', 'items', 'items.product'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findOne(id: string, requestingUser?: RequestingUser): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['client', 'items', 'items.product'],
    });
    if (!order) {
      throw new NotFoundException(`Orden ${id} no encontrada`);
    }
    this.assertOwnership(order, requestingUser);
    return order;
  }

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    requestingUser?: RequestingUser,
  ): Promise<Order> {
    const order = await this.findOne(id, requestingUser);

    // Validate state transitions
    const validTransitions = this.getValidTransitions(order.status);
    if (!validTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Transición no válida de ${order.status} a ${dto.status}. Transiciones válidas: ${validTransitions.join(', ')}`,
      );
    }

    order.status = dto.status;
    if (dto.blockedReason) order.blockedReason = dto.blockedReason;
    if (dto.validatedBy) {
      order.validatedBy = dto.validatedBy;
      order.validatedAt = new Date();
    }

    return this.orderRepository.save(order);
  }

  private getValidTransitions(current: OrderStatus): OrderStatus[] {
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.DRAFT]: [
        OrderStatus.PENDING_VALIDATION,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.PENDING_VALIDATION]: [
        OrderStatus.CONFIRMED,
        OrderStatus.BLOCKED,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.CONFIRMED]: [
        OrderStatus.PENDING_PRODUCTION,
        OrderStatus.READY_FOR_DELIVERY,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.PENDING_PRODUCTION]: [
        OrderStatus.IN_PRODUCTION,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.IN_PRODUCTION]: [OrderStatus.READY_FOR_DELIVERY],
      [OrderStatus.READY_FOR_DELIVERY]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.BLOCKED]: [
        OrderStatus.PENDING_VALIDATION,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.CANCELLED]: [],
    };
    return transitions[current] || [];
  }

  async remove(id: string, requestingUser?: RequestingUser): Promise<void> {
    await this.findOne(id, requestingUser);
    const result = await this.orderRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Orden ${id} no encontrada`);
    }
  }

  // Orders created before ownership tracking existed (createdBy === null)
  // remain visible to any authenticated user. Admins bypass ownership entirely.
  private assertOwnership(order: Order, requestingUser?: RequestingUser): void {
    if (!requestingUser || requestingUser.role === UserRole.ADMIN) {
      return;
    }
    if (order.createdBy && order.createdBy !== requestingUser.sub) {
      throw new ForbiddenException('No tiene permisos para acceder a esta orden');
    }
  }
}
