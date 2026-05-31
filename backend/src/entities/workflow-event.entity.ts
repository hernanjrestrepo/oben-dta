import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

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

@Entity('workflow_events')
export class WorkflowEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: WorkflowEventType })
  eventType: WorkflowEventType;

  @Column({
    type: 'enum',
    enum: WorkflowEventStatus,
    default: WorkflowEventStatus.PENDING,
  })
  status: WorkflowEventStatus;

  @Column({ type: 'text', comment: 'Workflow definition or process name' })
  workflowName: string;

  @Column({ type: 'text', comment: 'Current state before transition' })
  fromState: string;

  @Column({ type: 'text', comment: 'Target state after transition' })
  toState: string;

  @Column({ type: 'text', comment: 'Action that triggered the event' })
  action: string;

  @Column({ type: 'text', comment: 'Entity type being processed' })
  entityType: string;

  @Column({ type: 'text', comment: 'Entity ID being processed' })
  entityId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor: User;

  @Column({ name: 'actor_id', nullable: true })
  actorId: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Input data for the workflow event',
  })
  inputData: any;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Output data from the workflow event',
  })
  outputData: any;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Conditions evaluated for transition',
  })
  conditions: any;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for state transition or action',
  })
  reason: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Error message if event failed',
  })
  errorMessage: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Error stack trace if event failed',
  })
  errorStack: string | null;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'Retry count for failed events',
  })
  retryCount: number;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Scheduled execution time',
  })
  scheduledAt: Date;

  @Column({ type: 'timestamp', nullable: true, comment: 'Actual start time' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true, comment: 'Completion time' })
  completedAt: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reference to parent workflow event',
  })
  parentEventId: string;

  @Column({ type: 'text', nullable: true, comment: 'Process instance ID' })
  processInstanceId: string;

  @Column({ type: 'text', nullable: true, comment: 'Activity or task ID' })
  activityId: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether event requires manual intervention',
  })
  requiresManualIntervention: boolean;

  @Column({ nullable: true, comment: 'User who manually intervened' })
  intervenedBy: string;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Manual intervention timestamp',
  })
  intervenedAt: Date;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Additional context and metadata',
  })
  context: any;

  @CreateDateColumn({ comment: 'When the workflow event was created' })
  createdAt: Date;

  // Virtual properties
  get isFailed(): boolean {
    return this.status === WorkflowEventStatus.FAILED;
  }

  get isCompleted(): boolean {
    return this.status === WorkflowEventStatus.COMPLETED;
  }

  get duration(): number | null {
    if (!this.startedAt || !this.completedAt) return null;
    return this.completedAt.getTime() - this.startedAt.getTime(); // Milliseconds
  }

  get timeSinceCreation(): number {
    const now = new Date();
    const diffTime = now.getTime() - this.createdAt.getTime();
    return Math.ceil(diffTime / (1000 * 60)); // Minutes
  }
}
