import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Proforma que COMEX ya liquidó por fuera de Oben Xmart (reunión del 20-oct: la 11166 ya estaba hecha y seguía
 * en "pendientes"): sale de la lista de pendientes. Se puede seguir abriendo por número.
 */
@Entity('liquidacion_descartes')
export class LiquidacionDescarte extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'number_pf', type: 'varchar', length: 20 })
  numberPF: string;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @Column({ name: 'usuario_nombre', type: 'varchar', length: 255, nullable: true })
  usuarioNombre: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
