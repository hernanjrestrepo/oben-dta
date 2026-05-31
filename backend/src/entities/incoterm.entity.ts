import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum IncotermGroup {
  E = 'E', // Departure
  F = 'F', // Main carriage unpaid
  C = 'C', // Main carriage paid
  D = 'D', // Arrival
}

@Entity('incoterms')
export class Incoterm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    unique: true,
    length: 10,
    comment: 'Incoterm code (e.g., FOB, CIF, EXW)',
  })
  code: string;

  @Column({ comment: 'Full name of the incoterm' })
  name: string;

  @Column({
    type: 'enum',
    enum: IncotermGroup,
    comment: 'Incoterm group classification',
  })
  group: IncotermGroup;

  @Column({ type: 'text', comment: 'Detailed description of the incoterm' })
  description: string;

  @Column({ type: 'text', nullable: true, comment: 'Seller responsibilities' })
  sellerResponsibilities: string;

  @Column({ type: 'text', nullable: true, comment: 'Buyer responsibilities' })
  buyerResponsibilities: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'When to use this incoterm',
  })
  usageGuidelines: string;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Whether incoterm is active',
  })
  isActive: boolean;

  @Column({ type: 'int', default: 0, comment: 'Sort order for display' })
  sortOrder: number;

  @Column({ type: 'text', nullable: true, comment: 'Applicable trade regions' })
  applicableRegions: string;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    comment: 'Typical cost allocation percentage for seller',
  })
  typicalSellerCostPercentage: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Risk transfer point description',
  })
  riskTransferPoint: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether requires insurance',
  })
  requiresInsurance: boolean;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether requires freight payment',
  })
  requiresFreightPayment: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Customs clearance responsibility',
  })
  customsClearanceResponsibility: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Additional rules and variations',
  })
  additionalRules: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  updatedBy: string;

  // Virtual properties
  get displayName(): string {
    return `${this.code} - ${this.name}`;
  }

  get isFreightPaidBySeller(): boolean {
    return this.group === IncotermGroup.C || this.group === IncotermGroup.D;
  }

  get isInsurancePaidBySeller(): boolean {
    return (
      this.code === 'CIP' ||
      this.code === 'CIF' ||
      this.code === 'DAP' ||
      this.code === 'DPU' ||
      this.code === 'DDP'
    );
  }
}
