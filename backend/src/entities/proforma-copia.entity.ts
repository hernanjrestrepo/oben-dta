import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/** La proforma como la entregó Oben mientras estaba pendiente de liquidar (spCheckSettlement): se guarda para mostrarla siempre. */
@Entity('proforma_copias')
export class ProformaCopia extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'number_pf', type: 'varchar', length: 20 })
  numberPF: string;

  @Column({ name: 'orden_venta', type: 'varchar', length: 60, nullable: true })
  ordenVenta: string | null;

  @Column({ type: 'jsonb' })
  campos: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  detalle: Array<Record<string, unknown>>;

  @Column({ name: 'capturada_at', type: 'timestamptz', default: () => 'now()' })
  capturadaAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
