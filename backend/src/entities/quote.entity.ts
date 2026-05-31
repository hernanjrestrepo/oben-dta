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
import { Client } from './client.entity';
import { QuoteItem } from './quote-item.entity';

export enum QuoteStatus {
  RECEIVED = 'RECEIVED',
  PARSING = 'PARSING',
  QUOTED = 'QUOTED',
  SENT = 'SENT',
  APPROVED = 'APPROVED',
  ORDERED = 'ORDERED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAID = 'PAID',
  IN_PRODUCTION = 'IN_PRODUCTION',
  READY_FOR_DELIVERY = 'READY_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  REJECTED = 'REJECTED',
}

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  quoteNumber: string;

  @ManyToOne(() => Client, { eager: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column({ type: 'text', nullable: true })
  originalEmail: string;

  @Column({ type: 'text', nullable: true })
  parsedRequest: string;

  @OneToMany(() => QuoteItem, (item) => item.quote, { cascade: true })
  items: QuoteItem[];

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.RECEIVED })
  status: QuoteStatus;

  @Column({ type: 'text', nullable: true })
  pdfUrl: string;

  @Column({ type: 'text', nullable: true })
  paymentLink: string;

  @Column({ type: 'text', nullable: true })
  invoiceNumber: string;

  @Column({ nullable: true })
  approvedAt: Date;

  @Column({ nullable: true })
  paidAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
