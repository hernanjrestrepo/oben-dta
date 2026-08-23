import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Registro permanente de llamadas al Integration Hub que agotaron reintentos
 * (o encontraron el circuit breaker abierto) sin éxito. Nunca se borra
 * automáticamente — es la cola de "hay que mirar esto a mano" (WO-018 Sprint 3).
 */
@Entity('integration_dead_letters')
export class IntegrationDeadLetter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index()
  @Column({ length: 64 })
  system: string;

  @Column()
  operation: string;

  @Column({ type: 'jsonb' })
  args: Record<string, unknown>;

  @Column({ type: 'text' })
  error: string;

  @Column({ type: 'int' })
  attempts: number;

  @Column({ name: 'circuit_open', default: false })
  circuitOpen: boolean;

  @Column({ default: false })
  resolved: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
