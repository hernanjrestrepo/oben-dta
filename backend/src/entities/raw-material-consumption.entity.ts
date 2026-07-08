import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ProductionOrder } from './production-order.entity';
import { Product } from './product.entity';
import { User } from './user.entity';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

export enum RawMaterialType {
  RAW_MATERIAL = 'RAW_MATERIAL',
  COMPONENT = 'COMPONENT',
  SUB_ASSEMBLY = 'SUB_ASSEMBLY',
}

export enum RawMaterialConsumptionStatus {
  PLANNED = 'PLANNED',
  REQUESTED = 'REQUESTED',
  ISSUED = 'ISSUED',
  CONSUMED = 'CONSUMED',
  RETURNED = 'RETURNED',
  WASTED = 'WASTED',
}

@Entity('raw_material_consumptions')
@Unique('uq_raw_material_consumption_tenant_number', ['tenantId', 'consumptionNumber'])
export class RawMaterialConsumption extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  consumptionNumber: string;

  @ManyToOne(() => ProductionOrder, { eager: true })
  @JoinColumn({ name: 'production_order_id' })
  productionOrder: ProductionOrder;

  @Column({ name: 'production_order_id' })
  productionOrderId: string;

  @ManyToOne(() => Product, { eager: true })
  @JoinColumn({ name: 'raw_material_id' })
  rawMaterial: Product;

  @Column({ name: 'raw_material_id' })
  rawMaterialId: string;

  @Column({ type: 'enum', enum: RawMaterialType })
  materialType: RawMaterialType;

  @Column({
    type: 'enum',
    enum: RawMaterialConsumptionStatus,
    default: RawMaterialConsumptionStatus.PLANNED,
  })
  status: RawMaterialConsumptionStatus;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 3,
    comment: 'Planned quantity',
  })
  plannedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 3,
    comment: 'Requested quantity',
  })
  requestedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 3,
    comment: 'Issued quantity',
  })
  issuedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 3,
    comment: 'Consumed quantity',
  })
  consumedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 3,
    comment: 'Returned quantity',
  })
  returnedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 3,
    comment: 'Wasted quantity',
  })
  wastedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 3,
    comment: 'Actual consumption',
  })
  actualConsumption: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 3,
    comment: 'Unit of measure conversion factor',
  })
  uomConversionFactor: number;

  @Column({ type: 'text', nullable: true, comment: 'Batch or lot number' })
  batchNumber: string;

  @Column({ type: 'text', nullable: true, comment: 'Warehouse location' })
  warehouseLocation: string;

  @Column({ type: 'timestamp', nullable: true, comment: 'Request timestamp' })
  requestedAt: Date;

  @Column({ nullable: true, comment: 'User who requested the material' })
  requestedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'requestedBy' })
  requester: User;

  @Column({ type: 'timestamp', nullable: true, comment: 'Issuance timestamp' })
  issuedAt: Date;

  @Column({ nullable: true, comment: 'User who issued the material' })
  issuedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'issuedBy' })
  issuer: User;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Consumption timestamp',
  })
  consumedAt: Date;

  @Column({ nullable: true, comment: 'User who recorded consumption' })
  consumedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'consumedBy' })
  consumer: User;

  @Column({ type: 'timestamp', nullable: true, comment: 'Return timestamp' })
  returnedAt: Date;

  @Column({ nullable: true, comment: 'User who recorded return' })
  returnedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'returnedBy' })
  returner: User;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Waste recording timestamp',
  })
  wastedAt: Date;

  @Column({ nullable: true, comment: 'User who recorded waste' })
  wastedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'wastedBy' })
  waster: User;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Standard cost per unit',
  })
  standardCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Actual cost per unit',
  })
  actualCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Total standard cost',
  })
  totalStandardCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Total actual cost',
  })
  totalActualCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Cost variance',
  })
  costVariance: number;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether variance requires approval',
  })
  requiresVarianceApproval: boolean;

  @Column({ nullable: true, comment: 'User who approved variance' })
  varianceApprovedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'varianceApprovedBy' })
  varianceApprover: User;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Variance approval timestamp',
  })
  varianceApprovedAt: Date;

  @Column({ type: 'text', nullable: true, comment: 'Reason for variance' })
  varianceReason: string;

  @Column({ type: 'text', nullable: true, comment: 'Quality check results' })
  qualityCheck: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether quality check passed',
  })
  qualityCheckPassed: boolean;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Yield percentage for this material',
  })
  yieldPercentage: number;

  @Column({ type: 'text', nullable: true, comment: 'Reason for waste' })
  wasteReason: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Production line or machine',
  })
  productionLine: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Consumption specifications and requirements',
  })
  consumptionSpecs: any;

  @Column({ type: 'text', nullable: true, comment: 'Additional notes' })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  updatedBy: string;

  // Virtual properties
  get variancePercentage(): number {
    return this.totalStandardCost > 0
      ? (this.costVariance / this.totalStandardCost) * 100
      : 0;
  }

  get isOverConsumption(): boolean {
    return this.actualConsumption > this.plannedQuantity;
  }

  get consumptionEfficiency(): number {
    return this.plannedQuantity > 0
      ? (this.actualConsumption / this.plannedQuantity) * 100
      : 0;
  }

  get remainingToConsume(): number {
    return this.issuedQuantity - this.consumedQuantity;
  }

  get isFullyConsumed(): boolean {
    return this.status === RawMaterialConsumptionStatus.CONSUMED;
  }

  get wastePercentage(): number {
    return this.issuedQuantity > 0
      ? (this.wastedQuantity / this.issuedQuantity) * 100
      : 0;
  }
}
