import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Histórico de los cuadros de tarifas de fletes de exportación subidos desde la pantalla (María, 20-oct:
 * "descargo mi tarifario y lo subo aquí"; Hernán: "hay que guardar histórico de los cuadros de tarifas
 * subidos"). Cada carga guarda el archivo original, las tarifas que quedaron cargadas y TODAS las que
 * reemplazó (`respaldo`), para saber con qué tarifas se liquidó cada día y poder volver atrás.
 */
@Entity('freight_rate_cargas')
export class FreightRateCarga extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  archivo: string;

  /** El Excel tal cual se subió. */
  @Column({ type: 'bytea', nullable: true, select: false })
  contenido: Buffer | null;

  @Column({ type: 'int', nullable: true })
  tamano: number | null;

  /** Las tarifas que quedaron cargadas con este archivo (marítimas e Inland). */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb", select: false })
  tarifas: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  resumen: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb", select: false })
  respaldo: Record<string, unknown>;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @Column({ name: 'usuario_nombre', type: 'varchar', length: 255, nullable: true })
  usuarioNombre: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
