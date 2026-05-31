import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ExportOperation } from './export-operation.entity';
import { User } from './user.entity';

export enum FreightQuoteStatus {
  REQUESTED = 'REQUESTED',
  QUOTED = 'QUOTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum FreightType {
  SEA = 'SEA',
  AIR = 'AIR',
  LAND = 'LAND',
  RAIL = 'RAIL',
  MULTIMODAL = 'MULTIMODAL',
}

export enum FreightServiceLevel {
  ECONOMY = 'ECONOMY',
  STANDARD = 'STANDARD',
  EXPRESS = 'EXPRESS',
  PREMIUM = 'PREMIUM',
}

@Entity('freight_quotes')
export class FreightQuote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  quoteNumber: string;

  @ManyToOne(() => ExportOperation, { eager: true })
  @JoinColumn({ name: 'export_operation_id' })
  exportOperation: ExportOperation;

  @Column({ name: 'export_operation_id' })
  exportOperationId: string;

  @Column({
    type: 'enum',
    enum: FreightQuoteStatus,
    default: FreightQuoteStatus.REQUESTED,
  })
  status: FreightQuoteStatus;

  @Column({ type: 'enum', enum: FreightType, default: FreightType.SEA })
  freightType: FreightType;

  @Column({
    type: 'enum',
    enum: FreightServiceLevel,
    default: FreightServiceLevel.STANDARD,
  })
  serviceLevel: FreightServiceLevel;

  @Column({ type: 'text', comment: 'Origin port or location' })
  origin: string;

  @Column({ type: 'text', comment: 'Destination port or location' })
  destination: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Freight cost in local currency',
  })
  freightCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Additional charges',
  })
  additionalCharges: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Total quote amount',
  })
  totalAmount: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Currency code (e.g., USD, EUR, COP)',
  })
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
    type: 'timestamp',
    nullable: true,
    comment: 'Quote validity end date',
  })
  validUntil: Date;

  @Column({ type: 'int', nullable: true, comment: 'Transit time in days' })
  transitTime: number;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Expected departure date',
  })
  expectedDeparture: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Expected arrival date',
  })
  expectedArrival: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Carrier or freight forwarder name',
  })
  carrier: string;

  @Column({ type: 'text', nullable: true, comment: 'Carrier reference number' })
  carrierReference: string;

  @Column({ type: 'text', nullable: true, comment: 'Service type description' })
  serviceType: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether includes insurance',
  })
  includesInsurance: boolean;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    comment: 'Insurance cost if included',
  })
  insuranceCost: number;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether includes customs clearance',
  })
  includesCustoms: boolean;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    comment: 'Customs clearance cost if included',
  })
  customsCost: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'IncoTerm applicable to this quote',
  })
  incoterm: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Quote terms and conditions',
  })
  termsAndConditions: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special instructions or requirements',
  })
  specialInstructions: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether requires special handling',
  })
  requiresSpecialHandling: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special handling requirements',
  })
  specialHandlingRequirements: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Quote reference from carrier',
  })
  carrierQuoteReference: string;

  @Column({ nullable: true, comment: 'User who requested the quote' })
  requestedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'requestedBy' })
  requester: User;

  @Column({ type: 'timestamp', nullable: true, comment: 'Request timestamp' })
  requestedAt: Date;

  @Column({ nullable: true, comment: 'User who accepted/rejected the quote' })
  respondedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'respondedBy' })
  responder: User;

  @Column({ type: 'timestamp', nullable: true, comment: 'Response timestamp' })
  respondedAt: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for acceptance or rejection',
  })
  responseReason: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Detailed breakdown of costs',
  })
  costBreakdown: any;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Quote details and specifications',
  })
  quoteDetails: any;

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
  get isValid(): boolean {
    return (
      this.status === FreightQuoteStatus.QUOTED &&
      this.validUntil &&
      new Date() <= this.validUntil
    );
  }

  get isExpired(): boolean {
    return this.validUntil && new Date() > this.validUntil;
  }

  get totalCostInUSD(): number {
    if (this.currency === 'USD') return this.totalAmount;
    return this.exchangeRate
      ? this.totalAmount / this.exchangeRate
      : this.totalAmount;
  }

  get daysToExpiration(): number | null {
    if (!this.validUntil) return null;
    const today = new Date();
    const diffTime = this.validUntil.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}
