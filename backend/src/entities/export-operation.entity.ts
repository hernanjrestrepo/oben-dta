import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Order } from './order.entity';
import { Client } from './client.entity';
import { User } from './user.entity';
import { Incoterm } from './incoterm.entity';
import { FreightQuote } from './freight-quote.entity';
import { InsuranceQuote } from './insurance-quote.entity';
import { Shipment } from './shipment.entity';
import { ExportCostSheet } from './export-cost-sheet.entity';

export enum ExportOperationStatus {
  CREATED = 'CREATED',
  LIQUIDATED = 'LIQUIDATED',
  COSTED = 'COSTED',
  QUOTED = 'QUOTED',
  CONFIRMED = 'CONFIRMED',
  READY_FOR_SHIPMENT = 'READY_FOR_SHIPMENT',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum ExportType {
  STANDARD = 'STANDARD',
  EXPRESS = 'EXPRESS',
  CONSOLIDATED = 'CONSOLIDATED',
}

@Entity('export_operations')
export class ExportOperation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  exportNumber: string;

  @ManyToOne(() => Order, { eager: true })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Client, { eager: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column({
    type: 'enum',
    enum: ExportOperationStatus,
    default: ExportOperationStatus.CREATED,
  })
  status: ExportOperationStatus;

  @Column({ type: 'enum', enum: ExportType, default: ExportType.STANDARD })
  type: ExportType;

  @Column({ type: 'text', nullable: true, comment: 'Destination country' })
  destinationCountry: string;

  @Column({ type: 'text', nullable: true, comment: 'Destination port' })
  destinationPort: string;

  @Column({ type: 'text', nullable: true, comment: 'Destination address' })
  destinationAddress: string;

  @ManyToOne(() => Incoterm, { nullable: true })
  @JoinColumn({ name: 'incoterm_id' })
  incoterm: Incoterm;

  @Column({ name: 'incoterm_id', nullable: true })
  incotermId: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Total order value',
  })
  orderValue: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Liquidated value',
  })
  liquidatedValue: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Total export costs',
  })
  totalCosts: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Total export revenue',
  })
  totalRevenue: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Profit margin',
  })
  profitMargin: number;

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
    comment: 'Total net weight in kg',
  })
  totalNetWeight: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    comment: 'Total volume in m3',
  })
  totalVolume: number;

  @Column({ type: 'int', comment: 'Total number of packages' })
  totalPackages: number;

  @Column({ type: 'text', nullable: true, comment: 'Container type and size' })
  containerType: string;

  @Column({ type: 'text', nullable: true, comment: 'Container number' })
  containerNumber: string;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Expected departure date',
  })
  expectedDepartureDate: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Actual departure date',
  })
  actualDepartureDate: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Expected arrival date',
  })
  expectedArrivalDate: Date;

  @Column({ type: 'timestamp', nullable: true, comment: 'Actual arrival date' })
  actualArrivalDate: Date;

  @OneToOne(() => ExportCostSheet, (costSheet) => costSheet.exportOperation, {
    nullable: true,
  })
  costSheet: ExportCostSheet;

  @OneToOne(
    () => FreightQuote,
    (freightQuote) => freightQuote.exportOperation,
    { nullable: true },
  )
  freightQuote: FreightQuote;

  @OneToOne(
    () => InsuranceQuote,
    (insuranceQuote) => insuranceQuote.exportOperation,
    { nullable: true },
  )
  insuranceQuote: InsuranceQuote;

  @OneToOne(() => Shipment, (shipment) => shipment.exportOperation, {
    nullable: true,
  })
  shipment: Shipment;

  @Column({ type: 'jsonb', nullable: true, comment: 'Export documentation' })
  documentation: any;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Customs broker information',
  })
  customsBroker: string;

  @Column({ type: 'text', nullable: true, comment: 'Customs reference number' })
  customsReference: string;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Customs clearance date',
  })
  customsClearedAt: Date;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether customs clearance completed',
  })
  customsCleared: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special export requirements',
  })
  specialRequirements: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether requires export license',
  })
  requiresExportLicense: boolean;

  @Column({ type: 'text', nullable: true, comment: 'Export license number' })
  exportLicenseNumber: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Assigned logistics coordinator',
  })
  logisticsCoordinator: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'logisticsCoordinator' })
  coordinator: User;

  @Column({ type: 'text', nullable: true, comment: 'Additional notes' })
  notes: string;

  @Column({ type: 'jsonb', nullable: true, comment: 'Export compliance data' })
  complianceData: any;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether operation is consolidated',
  })
  isConsolidated: boolean;

  @Column({ nullable: true, comment: 'Consolidation reference' })
  consolidationReference: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  updatedBy: string;

  // Virtual properties
  get isShipped(): boolean {
    return (
      this.status === ExportOperationStatus.SHIPPED ||
      this.status === ExportOperationStatus.DELIVERED
    );
  }

  get isDelivered(): boolean {
    return this.status === ExportOperationStatus.DELIVERED;
  }

  get profit(): number {
    return this.totalRevenue - this.totalCosts;
  }

  get daysToDeparture(): number | null {
    if (!this.expectedDepartureDate) return null;
    const today = new Date();
    const diffTime = this.expectedDepartureDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  get shippingDelay(): number | null {
    if (!this.actualDepartureDate || !this.expectedDepartureDate) return null;
    const diffTime =
      this.actualDepartureDate.getTime() - this.expectedDepartureDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}
