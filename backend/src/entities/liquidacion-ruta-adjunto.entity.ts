import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Soporte de la justificación de un cambio de ruta/tarifa de COMEX (cotización
 * del forwarder, correo del booking…). Pedido de Hernán, 16-oct. El archivo se
 * guarda en la base: son pocos y pequeños (tope por archivo en el controlador).
 */
@Entity('liquidacion_ruta_adjuntos')
export class LiquidacionRutaAdjunto extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ruta_id', type: 'uuid' })
  rutaId: string;

  @Column({ name: 'number_pf', type: 'varchar', length: 20 })
  numberPF: string;

  @Column({ type: 'varchar', length: 255 })
  nombre: string;

  @Column({ type: 'varchar', length: 120 })
  tipo: string;

  @Column({ type: 'int' })
  tamano: number;

  @Column({ type: 'bytea', select: false })
  contenido: Buffer;

  @Column({ name: 'subido_por', type: 'uuid', nullable: true })
  subidoPor: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
