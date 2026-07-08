import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { Order } from './order.entity';
import { User } from './user.entity';
import { Shipment } from './shipment.entity';
import { PackingList } from './packing-list.entity';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

export enum MasterPackingListStatus {
  DRAFT = 'DRAFT',
  GENERATED = 'GENERATED',
  CONFIRMED = 'CONFIRMED',
  PRINTED = 'PRINTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPORTED = 'EXPORTED',
}

export enum MasterPackingListType {
  CONSOLIDATED = 'CONSOLIDATED',
  MASTER = 'MASTER',
  HOUSE = 'HOUSE',
}

@Entity('master_packing_lists')
@Unique('uq_master_packing_lists_tenant_number', [
  'tenantId',
  'masterPackingListNumber',
])
export class MasterPackingList extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  masterPackingListNumber: string;

  @ManyToOne(() => Order, { eager: true })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id' })
  orderId: string;

  @Column({
    type: 'enum',
    enum: MasterPackingListStatus,
    default: MasterPackingListStatus.DRAFT,
  })
  status: MasterPackingListStatus;

  @Column({
    type: 'enum',
    enum: MasterPackingListType,
    default: MasterPackingListType.MASTER,
  })
  type: MasterPackingListType;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Description of the master packing list',
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

  @Column({ type: 'text', nullable: true, comment: 'Warehouse location' })
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

  @OneToOne(() => Shipment, (shipment) => shipment.masterPackingList, {
    nullable: true,
  })
  shipment: Shipment;

  @OneToMany(
    () => PackingList,
    (packingList) => packingList.masterPackingList,
    { nullable: true },
  )
  packingLists: PackingList[];

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

  @Column({ type: 'text', nullable: true, comment: 'Exporter information' })
  exporter: string;

  @Column({ type: 'text', nullable: true, comment: 'Consignee information' })
  consignee: string;

  @Column({ type: 'text', nullable: true, comment: 'Notify party information' })
  notifyParty: string;

  @Column({ type: 'text', nullable: true, comment: 'Port of loading' })
  portOfLoading: string;

  @Column({ type: 'text', nullable: true, comment: 'Port of discharge' })
  portOfDischarge: string;

  @Column({ type: 'text', nullable: true, comment: 'Place of delivery' })
  placeOfDelivery: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Vessel or flight information',
  })
  vesselFlight: string;

  @Column({ type: 'text', nullable: true, comment: 'Voyage number' })
  voyageNumber: string;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Vessel departure date',
  })
  vesselDepartureDate: Date;

  @Column({ type: 'timestamp', nullable: true, comment: 'Vessel arrival date' })
  vesselArrivalDate: Date;

  @Column({ type: 'text', nullable: true, comment: 'Container number' })
  containerNumber: string;

  @Column({ type: 'text', nullable: true, comment: 'Seal number' })
  sealNumber: string;

  @Column({ type: 'text', nullable: true, comment: 'Customs information' })
  customsInfo: string;

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
    return (
      this.status === MasterPackingListStatus.COMPLETED ||
      this.status === MasterPackingListStatus.EXPORTED
    );
  }

  get weightDifference(): number {
    return this.totalGrossWeight - this.totalNetWeight;
  }

  get packagesPerItem(): number {
    return this.totalItems > 0 ? this.totalPackages / this.totalItems : 0;
  }
}
