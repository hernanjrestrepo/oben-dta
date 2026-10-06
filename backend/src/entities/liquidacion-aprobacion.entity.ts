import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Aprobación de COMEX de una liquidación: vale para unos valores concretos
 * (`huella` = hash del encabezado y las líneas que se enviarían a Oben). Si
 * cualquier valor cambia después, la huella ya no coincide y hay que volver a
 * aprobar. Una aprobación por PF (la nueva reemplaza a la anterior).
 */
@Entity('liquidacion_aprobaciones')
export class LiquidacionAprobacion extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'number_pf', type: 'varchar', length: 20 })
  numberPF: string;

  @Column({ type: 'varchar', length: 64 })
  huella: string;

  @Column({ name: 'aprobado_por', type: 'uuid', nullable: true })
  aprobadoPor: string | null;

  @Column({ name: 'aprobado_por_nombre', type: 'varchar', nullable: true })
  aprobadoPorNombre: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
