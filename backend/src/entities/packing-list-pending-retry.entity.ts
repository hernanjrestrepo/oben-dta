import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

export type PackingListRetryStatus = 'pending' | 'completed' | 'escalated' | 'cancelled';

/**
 * 'incompleto': falta un documento o falló el envío (cada 10 min, máx. 5).
 * 'cartera': retenida por la regla PND — cartera no ha liberado (cada 6 h,
 * sin límite, hasta que libere o alguien la cancele).
 */
export type PackingListRetryKind = 'incompleto' | 'cartera';

export interface PackingListRetryMissingItem {
  key: string;
  label: string;
  error: string;
}

/**
 * Cola de reintentos para el correo automático de "Lista de Empaque"
 * (PackingListAutomationService.handleOvApproved): pedido explícito del
 * usuario el 2026-09-14, tras dos correos reales (OV 11094, 11064) enviados
 * incompletos. Regla: no se manda NINGÚN correo hasta que el paquete de
 * documentos esté completo — si falta algo, se reintenta cada 10 minutos
 * hasta 5 veces; si sigue incompleto, se escala por correo a José Guzmán
 * (copia Jorge Restrepo) en vez de seguir reintentando en silencio.
 */
@Entity('packing_list_pending_retries')
export class PackingListPendingRetry extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'number_order_sales', type: 'int' })
  numberOrderSales: number;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'next_retry_at', type: 'timestamptz' })
  nextRetryAt: Date;

  @Column({ type: 'varchar', default: 'pending' })
  status: PackingListRetryStatus;

  @Column({ type: 'varchar', default: 'incompleto' })
  kind: PackingListRetryKind;

  /** Por qué está retenida (regla PND / fuente de cartera caída). */
  @Column({ name: 'hold_reason', type: 'text', nullable: true })
  holdReason: string | null;

  /** Un usuario autorizado confirmó que cartera liberó (p. ej. con la API de cartera caída): no se vuelve a verificar. */
  @Column({ name: 'cartera_override', type: 'boolean', default: false })
  carteraOverride: boolean;

  @Column({ name: 'last_missing', type: 'jsonb', nullable: true })
  lastMissing: PackingListRetryMissingItem[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
