import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Unique,
} from 'typeorm';
import { Client } from './client.entity';
import { OrderItem } from './order-item.entity';
import { CreditValidation } from './credit-validation.entity';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING_VALIDATION = 'PENDING_VALIDATION',
  CONFIRMED = 'CONFIRMED',
  PENDING_PRODUCTION = 'PENDING_PRODUCTION',
  IN_PRODUCTION = 'IN_PRODUCTION',
  READY_FOR_DELIVERY = 'READY_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED',
}

@Entity('orders')
@Unique('uq_orders_tenant_number', ['tenantId', 'orderNumber'])
export class Order extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderNumber: string;

  @ManyToOne(() => Client, (client) => client.orders, { eager: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ nullable: true })
  blockedReason: string;

  @Column({ nullable: true })
  validatedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  validatedAt: Date;

  @Column({ nullable: true })
  invoiceNumber: string;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @OneToMany(
    () => CreditValidation,
    (creditValidation) => creditValidation.order,
  )
  creditValidations: CreditValidation[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
