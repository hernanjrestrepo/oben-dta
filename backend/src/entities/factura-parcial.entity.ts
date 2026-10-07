import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * - pendiente: registrada, sin facturar.
 * - facturando: la llamada a Oben está en curso.
 * - facturada: Oben respondió éxito (Code 200).
 * - rechazada: Oben respondió isSuccessful=false — es seguro reintentar.
 * - revisar: no se supo si Oben facturó (timeout/red) — verificar en OBEN MAS antes de reintentar.
 */
export type EstadoFacturaParcial = 'pendiente' | 'facturando' | 'facturada' | 'rechazada' | 'revisar';

/** Solicitud de factura parcial de una proforma por número de distribución (WO-023). */
@Entity('facturas_parciales')
export class FacturaParcial extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'number_pf', type: 'varchar', length: 20 })
  numberPF: string;

  @Column({ name: 'numero_distribucion', type: 'varchar', length: 20 })
  numeroDistribucion: string;

  @Column({ type: 'varchar', length: 16 })
  /** correo = "Facturar Parcial" de Oben; manual = digitada; automatico = pedido nacional completo, al enviarse su Lista de Empaque. */
  origen: 'correo' | 'manual' | 'automatico';

  @Column({ name: 'message_id', type: 'varchar', nullable: true })
  messageId: string | null;

  @Column({ type: 'varchar', nullable: true })
  remitente: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pendiente' })
  estado: EstadoFacturaParcial;

  @Column({ type: 'jsonb', nullable: true })
  respuesta: unknown;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  /** 'real' | 'mock' según el adaptador de Oben que atendió la llamada. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  modo: string | null;

  @Column({ name: 'solicitado_por', type: 'uuid', nullable: true })
  solicitadoPor: string | null;

  @Column({ name: 'facturado_por', type: 'uuid', nullable: true })
  facturadoPor: string | null;

  @Column({ name: 'facturada_at', type: 'timestamptz', nullable: true })
  facturadaAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
