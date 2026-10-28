import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

export type TipoIa = 'imagen' | 'video';
export type EstadoIaUso = 'en_proceso' | 'completado' | 'fallido';

/** numeric llega como texto desde Postgres: se convierte al leer. */
const numerico = { to: (v: number | null) => v, from: (v: string | null) => (v === null || v === undefined ? null : Number(v)) };

/** Una generación de imagen o video (28-oct): el registro del gasto y la base de los topes de costo. */
@Entity('ia_usos')
export class IaUso extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @Column({ type: 'varchar', length: 16 })
  tipo: TipoIa;

  @Column({ type: 'varchar', length: 120 })
  modelo: string;

  @Column({ type: 'varchar', length: 16, default: 'economico' })
  nivel: string;

  @Column({ type: 'varchar', length: 16, default: 'en_proceso' })
  estado: EstadoIaUso;

  @Column({ name: 'costo_estimado_usd', type: 'numeric', precision: 10, scale: 4, default: 0, transformer: numerico })
  costoEstimadoUsd: number;

  @Column({ name: 'costo_real_usd', type: 'numeric', precision: 10, scale: 4, nullable: true, transformer: numerico })
  costoRealUsd: number | null;

  @Column({ name: 'trabajo_id', type: 'varchar', length: 120, nullable: true })
  trabajoId: string | null;

  @Column({ type: 'text', nullable: true })
  prompt: string | null;

  @Column({ type: 'jsonb', nullable: true })
  detalle: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'terminado_at', type: 'timestamptz', nullable: true })
  terminadoAt: Date | null;
}
