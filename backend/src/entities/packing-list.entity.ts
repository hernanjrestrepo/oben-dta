import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
  Unique,
} from 'typeorm';
import { Order } from './order.entity';
import { User } from './user.entity';
import { Shipment } from './shipment.entity';
import { MasterPackingList } from './master-packing-list.entity';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

export enum PackingListStatus {
  DRAFT = 'DRAFT',
  GENERATED = 'GENERATED',
  CONFIRMED = 'CONFIRMED',
  PRINTED = 'PRINTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PackingListType {
  STANDARD = 'STANDARD',
  EXPORT = 'EXPORT',
  SPECIAL = 'SPECIAL',
}

@Entity('packing_lists')
@Unique('uq_packing_lists_tenant_number', ['tenantId', 'packingListNumber'])
export class PackingList extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  packingListNumber: string;

  @ManyToOne(() => Order, { eager: true })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id' })
  orderId: string;

  @Column({
    type: 'enum',
    enum: PackingListStatus,
    default: PackingListStatus.DRAFT,
  })
  status: PackingListStatus;

  @Column({
    type: 'enum',
    enum: PackingListType,
    default: PackingListType.STANDARD,
  })
  type: PackingListType;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Description of the packing list',
  })
  description: string;

  @Column({ type: 'int', comment: 'Total number of items' })
  totalItems: number;

  @Column({ type: 'int', comment: 'Total number of packages' })
  totalPackages: number;

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

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Dimensions of master package',
  })
  masterPackageDimensions: string;

  @Column({ nullable: true, comment: 'Warehouse location' })
  warehouseLocation: string;

  @Column({ nullable: true, comment: 'Packing supervisor user ID' })
  packedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'packedBy' })
  packer: User;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Packing completion timestamp',
  })
  packedAt: Date;

  @Column({ nullable: true, comment: 'Quality control user ID' })
  qualityCheckedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'qualityCheckedBy' })
  qualityChecker: User;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Quality check timestamp',
  })
  qualityCheckedAt: Date;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether quality check passed',
  })
  qualityCheckPassed: boolean;

  @Column({ type: 'text', nullable: true, comment: 'Quality check notes' })
  qualityCheckNotes: string;

  @OneToOne(() => Shipment, (shipment) => shipment.packingList, {
    nullable: true,
  })
  shipment: Shipment;

  @ManyToOne(
    () => MasterPackingList,
    (masterPackingList) => masterPackingList.packingLists,
    { nullable: true },
  )
  @JoinColumn({ name: 'master_packing_list_id' })
  masterPackingList: MasterPackingList;

  @Column({ name: 'master_packing_list_id', nullable: true })
  masterPackingListId: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Detailed packing information',
  })
  packingDetails: any;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special handling instructions',
  })
  handlingInstructions: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether contains hazardous materials',
  })
  containsHazardousMaterials: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Hazardous materials declaration',
  })
  hazardousMaterialsDeclaration: string;

  @Column({ nullable: true, comment: 'Batch number' })
  batchNumber: string;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Expected shipping date',
  })
  expectedShippingDate: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Barcodes or QR codes data',
  })
  barcodeData: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether list has been printed',
  })
  isPrinted: boolean;

  @Column({ type: 'timestamp', nullable: true, comment: 'Print timestamp' })
  printedAt: Date;

  @Column({ type: 'text', nullable: true, comment: 'Printer information' })
  printedBy: string;

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
  get isCompleted(): boolean {
    return this.status === PackingListStatus.COMPLETED;
  }

  get weightDifference(): number {
    return this.totalGrossWeight - this.totalNetWeight;
  }

  get packagesPerItem(): number {
    return this.totalItems > 0 ? this.totalPackages / this.totalItems : 0;
  }
}
