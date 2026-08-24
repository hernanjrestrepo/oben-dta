import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export type EmailIntakeRoute =
  | 'quote_request'
  | 'purchase_order'
  | 'carrier'
  | 'comex'
  | 'freight_rates'
  | 'unknown';

export type EmailIntakeStatus = 'processed' | 'failed' | 'skipped';

/**
 * Checkpoint permanente de cada correo real leído por el conector IMAP
 * (WO-018 Sprint 6). Es la barrera de idempotencia a nivel de intake —
 * independiente de la bandera `\Seen` del propio buzón (que también se usa
 * como segunda barrera) — y el registro de auditoría de a dónde se enrutó
 * cada correo. `messageId` es el Message-ID real del correo (RFC 5322);
 * único por tenant para que un mismo correo nunca se procese dos veces
 * aunque el conector se reinicie a mitad de un lote.
 */
@Entity('email_intake_messages')
@Unique('UQ_email_intake_tenant_message', ['tenantId', 'messageId'])
export class EmailIntakeMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'message_id' })
  messageId: string;

  @Column({ name: 'imap_uid', type: 'bigint' })
  imapUid: string;

  @Column({ name: 'folder', default: 'INBOX' })
  folder: string;

  @Column()
  from: string;

  @Column()
  subject: string;

  @Column({ name: 'attachment_count', type: 'int', default: 0 })
  attachmentCount: number;

  @Column({ name: 'classification_category', type: 'varchar', nullable: true })
  classificationCategory: EmailIntakeRoute | null;

  @Column({ name: 'classification_confidence', type: 'float', nullable: true })
  classificationConfidence: number | null;

  @Column({ name: 'classification_provider', type: 'varchar', nullable: true })
  classificationProvider: string | null;

  @Column({ name: 'status', type: 'varchar', default: 'processed' })
  status: EmailIntakeStatus;

  @Column({ name: 'result_ref', type: 'varchar', nullable: true })
  resultRef: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'moved_to_folder', type: 'varchar', nullable: true })
  movedToFolder: string | null;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;
}
