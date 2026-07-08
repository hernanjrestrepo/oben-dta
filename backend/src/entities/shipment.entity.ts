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
import { ExportOperation } from './export-operation.entity';
import { PackingList } from './packing-list.entity';
import { User } from './user.entity';
import { MasterPackingList } from './master-packing-list.entity';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

export enum ShipmentStatus {
  CREATED = 'CREATED',
  SCHEDULED = 'SCHEDULED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  CUSTOMS_CLEARANCE = 'CUSTOMS_CLEARANCE',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
  LOST = 'LOST',
  DAMAGED = 'DAMAGED',
  CANCELLED = 'CANCELLED',
}

export enum ShipmentType {
  DOMESTIC = 'DOMESTIC',
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
  RETURN = 'RETURN',
}

export enum CarrierType {
  OWN_FLEET = 'OWN_FLEET',
  THIRD_PARTY = 'THIRD_PARTY',
  COURIER = 'COURIER',
  POSTAL = 'POSTAL',
}

@Entity('shipments')
@Unique('uq_shipments_tenant_number', ['tenantId', 'shipmentNumber'])
export class Shipment extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  shipmentNumber: string;

  @ManyToOne(() => Order, { nullable: true })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id', nullable: true })
  orderId: string;

  @ManyToOne(() => ExportOperation, { nullable: true })
  @JoinColumn({ name: 'export_operation_id' })
  exportOperation: ExportOperation;

  @Column({ name: 'export_operation_id', nullable: true })
  exportOperationId: string;

  @OneToOne(() => PackingList, (packingList) => packingList.shipment, {
    nullable: true,
  })
  packingList: PackingList;

  @OneToOne(
    () => MasterPackingList,
    (masterPackingList) => masterPackingList.shipment,
    { nullable: true },
  )
  masterPackingList: MasterPackingList;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    default: ShipmentStatus.CREATED,
  })
  status: ShipmentStatus;

  @Column({ type: 'enum', enum: ShipmentType, default: ShipmentType.DOMESTIC })
  type: ShipmentType;

  @Column({ type: 'enum', enum: CarrierType, default: CarrierType.THIRD_PARTY })
  carrierType: CarrierType;

  @Column({ type: 'text', comment: 'Origin location' })
  origin: string;

  @Column({ type: 'text', comment: 'Destination location' })
  destination: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Carrier or shipping company name',
  })
  carrier: string;

  @Column({ type: 'text', nullable: true, comment: 'Carrier tracking number' })
  trackingNumber: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Vehicle or container number',
  })
  vehicleNumber: string;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Scheduled pickup date',
  })
  scheduledPickupDate: Date;

  @Column({ type: 'timestamp', nullable: true, comment: 'Actual pickup date' })
  actualPickupDate: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Scheduled delivery date',
  })
  scheduledDeliveryDate: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Actual delivery date',
  })
  actualDeliveryDate: Date;

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

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Shipping cost',
  })
  shippingCost: number;

  @Column({ type: 'text', nullable: true, comment: 'Currency code' })
  currency: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Shipping method or service level',
  })
  shippingMethod: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether requires signature upon delivery',
  })
  requiresSignature: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special delivery instructions',
  })
  deliveryInstructions: string;

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

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether requires insurance',
  })
  requiresInsurance: boolean;

  @Column({ type: 'text', nullable: true, comment: 'Insurance policy number' })
  insurancePolicyNumber: string;

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

  @Column({ nullable: true, comment: 'Assigned logistics coordinator' })
  assignedTo: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignedTo' })
  coordinator: User;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Shipment tracking events',
  })
  trackingEvents: any;

  @Column({ type: 'jsonb', nullable: true, comment: 'Shipment documents' })
  documents: any;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Proof of delivery reference',
  })
  proofOfDelivery: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether delivery was successful',
  })
  deliverySuccessful: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Delivery exception or issue',
  })
  deliveryException: string;

  @Column({ type: 'text', nullable: true, comment: 'Recipient signature data' })
  recipientSignature: string;

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
  get isDelivered(): boolean {
    return this.status === ShipmentStatus.DELIVERED;
  }

  get isInTransit(): boolean {
    return [
      ShipmentStatus.PICKED_UP,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.CUSTOMS_CLEARANCE,
      ShipmentStatus.OUT_FOR_DELIVERY,
    ].includes(this.status);
  }

  get isDelayed(): boolean {
    return (
      this.scheduledDeliveryDate &&
      this.actualDeliveryDate === null &&
      new Date() > this.scheduledDeliveryDate
    );
  }

  get deliveryDelayDays(): number | null {
    if (!this.scheduledDeliveryDate || !this.actualDeliveryDate) return null;
    const diffTime =
      this.actualDeliveryDate.getTime() - this.scheduledDeliveryDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  get shipmentDuration(): number | null {
    if (!this.actualPickupDate || !this.actualDeliveryDate) return null;
    const diffTime =
      this.actualDeliveryDate.getTime() - this.actualPickupDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  get weightDifference(): number {
    return this.totalGrossWeight - this.totalNetWeight;
  }
}
