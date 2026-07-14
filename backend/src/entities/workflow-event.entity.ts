import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum WorkflowEventType {
  STATE_TRANSITION = 'STATE_TRANSITION',
  ACTION_EXECUTED = 'ACTION_EXECUTED',
  CONDITION_CHECKED = 'CONDITION_CHECKED',
  APPROVAL_GRANTED = 'APPROVAL_GRANTED',
  APPROVAL_REJECTED = 'APPROVAL_REJECTED',
  TIMER_TRIGGERED = 'TIMER_TRIGGERED',
  ERROR_OCCURRED = 'ERROR_OCCURRED',
  WORKFLOW_STARTED = 'WORKFLOW_STARTED',
  WORKFLOW_COMPLETED = 'WORKFLOW_COMPLETED',
  WORKFLOW_CANCELLED = 'WORKFLOW_CANCELLED',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  NOTIFICATION_SENT = 'NOTIFICATION_SENT',
  INTEGRATION_CALLED = 'INTEGRATION_CALLED',
}

export enum WorkflowEventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Bitácora de auditoría de negocio (distinta de `authorization_audit`, que
 * registra decisiones de permisos). Cada paso de un flujo de negocio
 * (ej. correo -> cliente -> cotización -> PDF -> envío) escribe aquí una fila
 * trazable por tenant, entidad y actor.
 */
@Entity('workflow_events')
export class WorkflowEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'enum', enum: WorkflowEventType })
  eventType: WorkflowEventType;

  @Column({
    type: 'enum',
    enum: WorkflowEventStatus,
    default: WorkflowEventStatus.COMPLETED,
  })
  status: WorkflowEventStatus;

  @Column()
  workflowName: string;

  @Column({ default: '' })
  fromState: string;

  @Column({ default: '' })
  toState: string;

  @Column()
  action: string;

  @Column()
  entityType: string;

  @Column()
  entityId: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  inputData: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  outputData: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  conditions: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'text', nullable: true })
  errorStack: string | null;

  @Column({ type: 'int', nullable: true })
  retryCount: number | null;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  parentEventId: string | null;

  @Column({ type: 'text', nullable: true })
  processInstanceId: string | null;

  @Column({ type: 'text', nullable: true })
  activityId: string | null;

  @Column({ default: false })
  requiresManualIntervention: boolean;

  @Column({ type: 'varchar', nullable: true })
  intervenedBy: string | null;

  @Column({ type: 'timestamp', nullable: true })
  intervenedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  context: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
