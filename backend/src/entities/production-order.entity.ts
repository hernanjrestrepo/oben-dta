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
import { Order } from './order.entity';
import { Product } from './product.entity';
import { User } from './user.entity';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

export enum ProductionOrderStatus {
  PENDING = 'PENDING',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED',
}

export enum ProductionPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
  CRITICAL = 'CRITICAL',
}

@Entity('production_orders')
@Unique('uq_production_orders_tenant_number', ['tenantId', 'productionOrderNumber'])
export class ProductionOrder extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productionOrderNumber: string;

  @ManyToOne(() => Order, { eager: true })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Product, { eager: true })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({
    type: 'enum',
    enum: ProductionOrderStatus,
    default: ProductionOrderStatus.PENDING,
  })
  status: ProductionOrderStatus;

  @Column({
    type: 'enum',
    enum: ProductionPriority,
    default: ProductionPriority.NORMAL,
  })
  priority: ProductionPriority;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 3,
    comment: 'Quantity to produce',
  })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 3,
    comment: 'Quantity completed',
  })
  completedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 3,
    comment: 'Quantity remaining',
  })
  remainingQuantity: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Production line or machine',
  })
  productionLine: string;

  @Column({ nullable: true, comment: 'Assigned operator user ID' })
  assignedTo: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignedTo' })
  operator: User;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Scheduled start date',
  })
  scheduledStartDate: Date;

  @Column({ type: 'timestamp', nullable: true, comment: 'Actual start date' })
  actualStartDate: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Scheduled completion date',
  })
  scheduledCompletionDate: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Actual completion date',
  })
  actualCompletionDate: Date;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Estimated production time in hours',
  })
  estimatedProductionTime: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Actual production time in hours',
  })
  actualProductionTime: number;

  @Column({ type: 'text', nullable: true, comment: 'Production instructions' })
  instructions: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Raw material requirements',
  })
  materialRequirements: any;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Quality control checkpoints',
  })
  qualityCheckpoints: any;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether quality checks passed',
  })
  qualityChecksPassed: boolean;

  @Column({ type: 'text', nullable: true, comment: 'Quality check results' })
  qualityCheckResults: string;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Yield percentage',
  })
  yieldPercentage: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    comment: 'Production cost',
  })
  productionCost: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for hold or cancellation',
  })
  holdReason: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'User who put order on hold',
  })
  heldBy: string | null;

  @Column({ type: 'timestamp', nullable: true, comment: 'Hold timestamp' })
  heldAt: Date | null;

  @Column({ type: 'text', nullable: true, comment: 'Additional notes' })
  notes: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Production metrics and KPIs',
  })
  productionMetrics: any;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether order requires special approval',
  })
  requiresSpecialApproval: boolean;

  @Column({ nullable: true, comment: 'Special approval user ID' })
  approvedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approvedBy' })
  approver: User;

  @Column({ type: 'timestamp', nullable: true, comment: 'Approval timestamp' })
  approvedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  updatedBy: string;

  // Virtual properties
  get progressPercentage(): number {
    return this.quantity > 0
      ? (this.completedQuantity / this.quantity) * 100
      : 0;
  }

  get isCompleted(): boolean {
    return this.status === ProductionOrderStatus.COMPLETED;
  }

  get isInProgress(): boolean {
    return this.status === ProductionOrderStatus.IN_PROGRESS;
  }

  get isOverdue(): boolean {
    return (
      this.scheduledCompletionDate &&
      new Date() > this.scheduledCompletionDate &&
      !this.isCompleted
    );
  }

  get remainingTime(): number | null {
    if (!this.scheduledCompletionDate) return null;
    const now = new Date();
    const diffTime = this.scheduledCompletionDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Days
  }
}
