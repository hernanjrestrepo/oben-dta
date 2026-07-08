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
import { Order } from './order.entity';
import { Client } from './client.entity';
import { User } from './user.entity';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

export enum CreditValidationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ESCALATED = 'ESCALATED',
  EXPIRED = 'EXPIRED',
}

export enum CreditValidationType {
  AUTOMATIC = 'AUTOMATIC',
  MANUAL = 'MANUAL',
  EXCEPTION = 'EXCEPTION',
}

@Entity('credit_validations')
@Unique('uq_credit_validations_tenant_number', ['tenantId', 'validationNumber'])
export class CreditValidation extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  validationNumber: string;

  @ManyToOne(() => Order, (order) => order.creditValidations, {
    nullable: true,
  })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id', nullable: true })
  orderId: string;

  @ManyToOne(() => Client, { eager: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column({
    type: 'enum',
    enum: CreditValidationStatus,
    default: CreditValidationStatus.PENDING,
  })
  status: CreditValidationStatus;

  @Column({
    type: 'enum',
    enum: CreditValidationType,
    default: CreditValidationType.AUTOMATIC,
  })
  type: CreditValidationType;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Order amount to validate',
  })
  orderAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Client credit limit',
  })
  creditLimit: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Client used credit',
  })
  usedCredit: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Available credit for client',
  })
  availableCredit: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    comment: 'Credit utilization percentage',
  })
  utilizationPercentage: number;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether credit is sufficient',
  })
  isCreditSufficient: boolean;

  @Column({ type: 'int', default: 0, comment: 'Client credit score (0-100)' })
  creditScore: number;

  @Column({ type: 'text', nullable: true, comment: 'Validation rules applied' })
  rulesApplied: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for approval or rejection',
  })
  decisionReason: string | null;

  @Column({ nullable: true, comment: 'User who approved/rejected validation' })
  validatedBy: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'validatedBy' })
  validator: User;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Validation timestamp',
  })
  validatedAt: Date | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Expiration timestamp',
  })
  expiresAt: Date | null;

  @Column({ type: 'text', nullable: true, comment: 'Additional notes' })
  notes: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Validation details and scores',
  })
  validationDetails: any;

  @Column({
    default: false,
    comment: 'Whether validation requires manual review',
  })
  requiresManualReview: boolean;

  @Column({ nullable: true, comment: 'Escalation level (1-3)' })
  escalationLevel: number;

  @Column({ nullable: true, comment: 'Reference to approval workflow' })
  workflowReference: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  updatedBy: string;

  // Virtual properties
  get isExpired(): boolean {
    return this.expiresAt ? new Date() > this.expiresAt : false;
  }

  get isValid(): boolean {
    return this.status === CreditValidationStatus.APPROVED && !this.isExpired;
  }

  get creditRemainingAfterOrder(): number {
    return this.isCreditSufficient
      ? this.availableCredit - this.orderAmount
      : 0;
  }
}
