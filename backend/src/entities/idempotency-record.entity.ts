import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';

export enum IdempotencyStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Registro transversal de idempotencia (WO-018 Sprint 4) — un correo (o
 * cualquier evento externo repetible) reclama una fila aquí ANTES de que su
 * flujo corra. Si la fila ya existe (`tenantId`+`key` es único), el flujo NO
 * se ejecuta de nuevo: se devuelve el resultado guardado (si `completed`) o
 * se rechaza como duplicado en curso (si `processing`).
 *
 * El índice único es el mecanismo de atomicidad bajo concurrencia (dos
 * requests simultáneas con la misma `key` no pueden ganar la carrera ambas),
 * pero la idempotencia en sí se resuelve ANTES de ejecutar el flujo — el
 * índice solo hace que ese "antes" sea seguro entre procesos concurrentes,
 * no es la estrategia completa.
 */
@Entity('idempotency_records')
@Unique('uq_idempotency_tenant_key', ['tenantId', 'key'])
export class IdempotencyRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 128 })
  key: string;

  @Column({ name: 'event_type', length: 64 })
  eventType: string;

  @Column({
    type: 'enum',
    enum: IdempotencyStatus,
    default: IdempotencyStatus.PROCESSING,
  })
  status: IdempotencyStatus;

  @Column({ type: 'jsonb', nullable: true })
  result: unknown;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
