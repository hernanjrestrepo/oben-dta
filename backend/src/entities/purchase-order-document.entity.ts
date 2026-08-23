import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PurchaseOrderDocumentStatus {
  RECEIVED = 'received',
  ORDER_CREATED = 'order_created',
  VALIDATION_FAILED = 'validation_failed',
}

export interface PurchaseOrderExtractedItem {
  /** SKU/nombre tal como aparece en el correo, antes de matchear contra el catálogo. */
  raw: string;
  quantity: number;
  /** Product.id si se logró matchear contra el catálogo; null si no. */
  productId: string | null;
}

/**
 * El documento de Orden de Compra que envía el cliente — DISTINTO de `Order`
 * (la Sales Order interna). Nunca hay garantía de 1:1: un mismo
 * `PurchaseOrderDocument` puede fallar validación y no producir ninguna
 * Order; a futuro, modificaciones/cancelaciones/parciales del cliente sobre
 * la misma PO, o varias PO alimentando una sola Order consolidada, necesitan
 * esta separación para no reescribirse (recomendación explícita de WO-017).
 */
@Entity('purchase_order_documents')
export class PurchaseOrderDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'po_number', type: 'varchar', nullable: true })
  poNumber: string | null;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ name: 'sender_email' })
  senderEmail: string;

  @Column({ name: 'sender_domain' })
  senderDomain: string;

  @Column({ name: 'po_date', type: 'timestamptz', nullable: true })
  poDate: Date | null;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  items: PurchaseOrderExtractedItem[];

  @Column({ name: 'payment_terms', type: 'varchar', nullable: true })
  paymentTerms: string | null;

  @Column({ type: 'varchar', nullable: true })
  incoterm: string | null;

  @Column({ type: 'text', nullable: true })
  observations: string | null;

  @Column({ name: 'contact_person', type: 'varchar', nullable: true })
  contactPerson: string | null;

  @Column({ name: 'related_quote_id', type: 'uuid', nullable: true })
  relatedQuoteId: string | null;

  @Column({
    type: 'enum',
    enum: PurchaseOrderDocumentStatus,
    default: PurchaseOrderDocumentStatus.RECEIVED,
  })
  status: PurchaseOrderDocumentStatus;

  @Column({ name: 'created_order_id', type: 'uuid', nullable: true })
  createdOrderId: string | null;

  /** Snapshot de qué validaciones pasaron/fallaron — evidencia directa en el documento, además de la auditoría del motor. */
  @Column({ name: 'validation_results', type: 'jsonb', nullable: true })
  validationResults: Array<{ type: string; passed: boolean; message?: string }> | null;

  /** Salida del DocumentClassifier — con qué categoría/confianza/proveedor se identificó este correo como PO. */
  @Column({ type: 'jsonb', nullable: true })
  classification: {
    category: string;
    confidence: number;
    reasons: string[];
    provider: string;
  } | null;

  @Column({ name: 'raw_email_body', type: 'text' })
  rawEmailBody: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
