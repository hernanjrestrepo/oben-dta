import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Generated } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Cambio de ruta de COMEX sobre la preliquidación de una PF (orden de compra
 * interna, reunión del 15-oct). Las tarifas salen SIEMPRE del tarifario
 * (ids de freight_ocean_rates / freight_inland_rates), nunca se digitan. La
 * ruta vigente de la PF es su último registro; ids en null = la sugerida.
 */
@Entity('liquidacion_rutas')
export class LiquidacionRuta extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', insert: false, update: false })
  @Generated('increment')
  numero: number;

  @Column({ name: 'number_pf', type: 'varchar', length: 20 })
  numberPF: string;

  @Column({ name: 'maritima_id', type: 'uuid', nullable: true })
  maritimaId: string | null;

  @Column({ name: 'inland_id', type: 'uuid', nullable: true })
  inlandId: string | null;

  /** Antes / después / sugerida / sobrecosto, tal como se vio al escoger. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  detalle: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @Column({ name: 'usuario_nombre', type: 'varchar', nullable: true })
  usuarioNombre: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
