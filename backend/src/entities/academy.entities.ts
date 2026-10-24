import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/** Avance de una persona en un módulo de Xmart Academy. */
@Entity('academy_progreso')
export class AcademyProgreso extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 40 })
  modulo: string;

  @Column({ name: 'visto_at', type: 'timestamptz', nullable: true })
  vistoAt: Date | null;

  @Column({ name: 'version_vista', type: 'int', nullable: true })
  versionVista: number | null;

  @Column({ name: 'aprobado_at', type: 'timestamptz', nullable: true })
  aprobadoAt: Date | null;

  @Column({ name: 'version_aprobada', type: 'int', nullable: true })
  versionAprobada: number | null;

  @Column({ name: 'mejor_puntaje', type: 'int', nullable: true })
  mejorPuntaje: number | null;

  @Column({ type: 'int', default: 0 })
  intentos: number;

  /** Tiempo acumulado en la lección (lo reporta la pantalla). */
  @Column({ type: 'int', default: 0 })
  segundos: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

/** Un intento de quiz, calificado en el servidor. */
@Entity('academy_intentos')
export class AcademyIntento extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 40 })
  modulo: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'int' })
  puntaje: number;

  @Column({ type: 'boolean' })
  aprobado: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  respuestas: Array<{ id: string; elegida: number | null; correcta: boolean }>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

/**
 * Uso y fricción: lección abierta, tiempo, "ir al módulo", pregunta a MIA, error de la API en un módulo, acción
 * bloqueada por falta de certificación… Con esto el panel de fricciones muestra dónde le cuesta a la gente.
 */
@Entity('academy_eventos')
export class AcademyEvento extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  modulo: string | null;

  @Column({ type: 'varchar', length: 40 })
  tipo: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  detalle: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
