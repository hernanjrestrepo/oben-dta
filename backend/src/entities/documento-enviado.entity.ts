import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Copia de cada archivo que Oben Xmart envía en el correo de Lista de Empaque, junto con lo que Oben respondió para
 * generarlo. Existe para poder comparar cuando alguien reclame una cifra (OV 11314, 5-nov-2026: el Excel enviado y la
 * respuesta de Oben ya no se podían recuperar).
 */
@Entity('documentos_enviados')
export class DocumentoEnviado extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'number_order_sales', type: 'int' })
  numberOrderSales: number;

  /** Id del mensaje que devolvió el envío (el mismo que queda en el evento de auditoría). */
  @Column({ name: 'message_id', type: 'varchar', nullable: true })
  messageId: string | null;

  @Column({ type: 'text', nullable: true })
  asunto: string | null;

  @Column({ type: 'text', nullable: true })
  destinatarios: string | null;

  @Column({ name: 'clave_reporte', type: 'varchar', length: 60 })
  claveReporte: string;

  @Column({ type: 'varchar' })
  archivo: string;

  @Column({ name: 'content_type', type: 'varchar' })
  contentType: string;

  @Column({ type: 'int' })
  bytes: number;

  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ type: 'bytea', select: false })
  contenido: Buffer;

  /** Respuesta de Oben (JSON) con la que se armó el archivo. */
  @Column({ type: 'jsonb', nullable: true, select: false })
  fuente: unknown;

  /** Advertencias de coherencia que viajaron en el correo. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  avisos: string[];

  @Column({ name: 'simulado', type: 'boolean', default: false })
  simulado: boolean;

  @CreateDateColumn({ name: 'enviado_at', type: 'timestamptz' })
  enviadoAt: Date;
}
