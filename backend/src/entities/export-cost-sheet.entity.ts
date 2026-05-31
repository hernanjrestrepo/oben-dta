import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { ExportOperation } from './export-operation.entity';
import { Product } from './product.entity';
import { User } from './user.entity';

export enum CostSheetStatus {
  DRAFT = 'DRAFT',
  CALCULATED = 'CALCULATED',
  REVIEWED = 'REVIEWED',
  APPROVED = 'APPROVED',
  FINALIZED = 'FINALIZED',
}

export enum CostType {
  PRODUCT = 'PRODUCT',
  FREIGHT = 'FREIGHT',
  INSURANCE = 'INSURANCE',
  CUSTOMS = 'CUSTOMS',
  HANDLING = 'HANDLING',
  STORAGE = 'STORAGE',
  DOCUMENTATION = 'DOCUMENTATION',
  BANK = 'BANK',
  COMMISSION = 'COMMISSION',
  OTHER = 'OTHER',
}

@Entity('export_cost_sheets')
export class ExportCostSheet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  costSheetNumber: string;

  @ManyToOne(
    () => ExportOperation,
    (exportOperation) => exportOperation.costSheet,
    { eager: true },
  )
  @JoinColumn({ name: 'export_operation_id' })
  exportOperation: ExportOperation;

  @Column({ name: 'export_operation_id' })
  exportOperationId: string;

  @Column({
    type: 'enum',
    enum: CostSheetStatus,
    default: CostSheetStatus.DRAFT,
  })
  status: CostSheetStatus;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Total product cost',
  })
  totalProductCost: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, comment: 'Freight cost' })
  freightCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Insurance cost',
  })
  insuranceCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Customs duties and taxes',
  })
  customsCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Handling and storage cost',
  })
  handlingCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Documentation and certification cost',
  })
  documentationCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Bank and financial charges',
  })
  bankCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Commission and fees',
  })
  commissionCost: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, comment: 'Other costs' })
  otherCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Total export costs',
  })
  totalCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Total export revenue',
  })
  totalRevenue: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, comment: 'Gross profit' })
  grossProfit: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    comment: 'Gross profit margin percentage',
  })
  grossProfitMargin: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Net profit after all costs',
  })
  netProfit: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    comment: 'Net profit margin percentage',
  })
  netProfitMargin: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    comment: 'Cost to revenue ratio percentage',
  })
  costToRevenueRatio: number;

  @Column({ type: 'text', nullable: true, comment: 'Currency code' })
  currency: string;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    comment: 'Exchange rate to local currency',
  })
  exchangeRate: number;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Detailed cost breakdown by item',
  })
  costBreakdown: any;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Cost allocation by product',
  })
  productCostAllocation: any;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether costs have been finalized',
  })
  isFinalized: boolean;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Finalization timestamp',
  })
  finalizedAt: Date;

  @Column({ nullable: true, comment: 'User who finalized the cost sheet' })
  finalizedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'finalizedBy' })
  finalizer: User;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for any cost adjustments',
  })
  adjustmentReason: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether requires management approval',
  })
  requiresApproval: boolean;

  @Column({ nullable: true, comment: 'User who approved the cost sheet' })
  approvedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approvedBy' })
  approver: User;

  @Column({ type: 'timestamp', nullable: true, comment: 'Approval timestamp' })
  approvedAt: Date;

  @Column({ type: 'text', nullable: true, comment: 'Additional notes' })
  notes: string;

  @Column({ type: 'jsonb', nullable: true, comment: 'Audit trail of changes' })
  auditTrail: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  updatedBy: string;

  // Virtual properties
  get isApproved(): boolean {
    return (
      this.status === CostSheetStatus.APPROVED ||
      this.status === CostSheetStatus.FINALIZED
    );
  }

  get totalAdditionalCosts(): number {
    return (
      this.freightCost +
      this.insuranceCost +
      this.customsCost +
      this.handlingCost +
      this.documentationCost +
      this.bankCost +
      this.commissionCost +
      this.otherCost
    );
  }

  get costToRevenuePercentage(): number {
    return this.totalRevenue > 0
      ? (this.totalCost / this.totalRevenue) * 100
      : 0;
  }

  get revenueToCostRatio(): number {
    return this.totalCost > 0 ? this.totalRevenue / this.totalCost : 0;
  }

  get isProfitable(): boolean {
    return this.netProfit > 0;
  }
}
