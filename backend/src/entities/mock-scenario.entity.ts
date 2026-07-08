import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';

/**
 * Escenario mock persistente por tenant. Sobrescribe el comportamiento del
 * mock adapter para (system, operation). Si no existe fila, se aplica happy_path.
 *
 * Ejemplos de uso:
 *   - DIAN.invoice.send → business_error código CUFE_REJECTED durante demo QA
 *   - shipping.tracking.get → latency 5s para probar UX con carga
 *   - email.send → auth_error para verificar retry policy
 */
@Entity('mock_scenarios')
@Unique('uq_mock_scenarios_key', ['tenantId', 'system', 'operation'])
export class MockScenario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  system: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  operation: string;

  @Column({ type: 'varchar', length: 32 })
  behavior: string;

  @Column({ name: 'latency_ms', type: 'int', nullable: true })
  latencyMs: number | null;

  @Column({ name: 'jitter_ms', type: 'int', nullable: true })
  jitterMs: number | null;

  @Column({ name: 'http_status', type: 'int', nullable: true })
  httpStatus: number | null;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'error_ratio', type: 'decimal', precision: 5, scale: 4, nullable: true })
  errorRatio: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'set_by', type: 'uuid', nullable: true })
  setBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
