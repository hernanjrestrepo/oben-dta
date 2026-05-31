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

export enum InsuranceQuoteStatus {
  REQUESTED = 'REQUESTED',
  QUOTED = 'QUOTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  ISSUED = 'ISSUED',
}

export enum InsuranceType {
  CARGO = 'CARGO',
  FREIGHT = 'FREIGHT',
  LIABILITY = 'LIABILITY',
  ALL_RISKS = 'ALL_RISKS',
}

export enum CoverageType {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  COMPREHENSIVE = 'COMPREHENSIVE',
}

@Entity('insurance_quotes')
export class InsuranceQuote {
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
    enum: InsuranceQuoteStatus,
    default: InsuranceQuoteStatus.REQUESTED,
  })
  status: InsuranceQuoteStatus;

  @Column({ type: 'enum', enum: InsuranceType, default: InsuranceType.CARGO })
  insuranceType: InsuranceType;

  @Column({ type: 'enum', enum: CoverageType, default: CoverageType.STANDARD })
  coverageType: CoverageType;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Insured value',
  })
  insuredValue: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Insurance premium',
  })
  premium: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    comment: 'Premium rate percentage',
  })
  premiumRate: number;

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
    type: 'timestamp',
    nullable: true,
    comment: 'Quote validity end date',
  })
  validUntil: Date;

  @Column({ type: 'text', comment: 'Origin location' })
  origin: string;

  @Column({ type: 'text', comment: 'Destination location' })
  destination: string;

  @Column({ type: 'text', nullable: true, comment: 'Mode of transport' })
  transportMode: string;

  @Column({ type: 'timestamp', comment: 'Coverage start date' })
  coverageStartDate: Date;

  @Column({ type: 'timestamp', comment: 'Coverage end date' })
  coverageEndDate: Date;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    comment: 'Total gross weight in kg',
  })
  totalGrossWeight: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    comment: 'Total volume in m3',
  })
  totalVolume: number;

  @Column({ type: 'text', nullable: true, comment: 'Insurance company name' })
  insuranceCompany: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Insurance company reference',
  })
  companyReference: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether includes war risk coverage',
  })
  includesWarRisk: boolean;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    comment: 'War risk premium if included',
  })
  warRiskPremium: number;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether includes strike risk coverage',
  })
  includesStrikeRisk: boolean;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    comment: 'Strike risk premium if included',
  })
  strikeRiskPremium: number;

  @Column({ type: 'text', nullable: true, comment: 'Deductible amount' })
  deductible: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Coverage terms and conditions',
  })
  coverageTerms: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Exclusions and limitations',
  })
  exclusions: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether requires special clauses',
  })
  requiresSpecialClauses: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special clauses or endorsements',
  })
  specialClauses: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Policy number when issued',
  })
  policyNumber: string;

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

  @Column({ type: 'jsonb', nullable: true, comment: 'Risk assessment details' })
  riskAssessment: any;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Coverage details and specifications',
  })
  coverageDetails: any;

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
      this.status === InsuranceQuoteStatus.QUOTED &&
      this.validUntil &&
      new Date() <= this.validUntil
    );
  }

  get isExpired(): boolean {
    return this.validUntil && new Date() > this.validUntil;
  }

  get totalPremium(): number {
    return this.premium + this.warRiskPremium + this.strikeRiskPremium;
  }

  get premiumInUSD(): number {
    if (this.currency === 'USD') return this.totalPremium;
    return this.exchangeRate
      ? this.totalPremium / this.exchangeRate
      : this.totalPremium;
  }

  get coverageDays(): number {
    const diffTime =
      this.coverageEndDate.getTime() - this.coverageStartDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  get daysToExpiration(): number | null {
    if (!this.validUntil) return null;
    const today = new Date();
    const diffTime = this.validUntil.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}
