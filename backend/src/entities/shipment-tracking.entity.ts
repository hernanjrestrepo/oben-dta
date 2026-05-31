import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Shipment } from './shipment.entity';
import { User } from './user.entity';

export enum TrackingStatus {
  CREATED = 'CREATED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  ARRIVED_AT_HUB = 'ARRIVED_AT_HUB',
  DEPARTED_FROM_HUB = 'DEPARTED_FROM_HUB',
  CUSTOMS_CLEARANCE = 'CUSTOMS_CLEARANCE',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
  EXCEPTION = 'EXCEPTION',
}

export enum TrackingLocationType {
  ORIGIN = 'ORIGIN',
  DESTINATION = 'DESTINATION',
  HUB = 'HUB',
  CUSTOMS = 'CUSTOMS',
  DELIVERY = 'DELIVERY',
  EXCEPTION = 'EXCEPTION',
}

@Entity('shipment_tracking')
export class ShipmentTracking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shipment, { eager: true })
  @JoinColumn({ name: 'shipment_id' })
  shipment: Shipment;

  @Column({ name: 'shipment_id' })
  shipmentId: string;

  @Column({ type: 'enum', enum: TrackingStatus })
  status: TrackingStatus;

  @Column({ type: 'enum', enum: TrackingLocationType })
  locationType: TrackingLocationType;

  @Column({ type: 'text', comment: 'Location name or description' })
  location: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Detailed location address',
  })
  locationAddress: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 8,
    nullable: true,
    comment: 'GPS latitude',
  })
  latitude: number;

  @Column({
    type: 'decimal',
    precision: 11,
    scale: 8,
    nullable: true,
    comment: 'GPS longitude',
  })
  longitude: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Person or system who recorded the event',
  })
  recordedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'recordedBy' })
  recorder: User;

  @Column({ type: 'timestamp', comment: 'Event timestamp' })
  eventTimestamp: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Additional details about the event',
  })
  details: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Proof of event (photo, signature, etc.)',
  })
  proof: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether event requires confirmation',
  })
  requiresConfirmation: boolean;

  @Column({ nullable: true, comment: 'User who confirmed the event' })
  confirmedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'confirmedBy' })
  confirmer: User;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Confirmation timestamp',
  })
  confirmedAt: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for exception or delay',
  })
  exceptionReason: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether event is an exception',
  })
  isException: boolean;

  @Column({ type: 'jsonb', nullable: true, comment: 'Additional metadata' })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Virtual properties
  get isDelivered(): boolean {
    return this.status === TrackingStatus.DELIVERED;
  }

  get isExceptionEvent(): boolean {
    return this.isException || this.status === TrackingStatus.EXCEPTION;
  }

  get timeSinceEvent(): number {
    const now = new Date();
    const diffTime = now.getTime() - this.eventTimestamp.getTime();
    return Math.ceil(diffTime / (1000 * 60)); // Minutes
  }
}
