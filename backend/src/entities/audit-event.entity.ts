import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum AuditEventType {
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  DATA_ACCESS = 'DATA_ACCESS',
  DATA_MODIFICATION = 'DATA_MODIFICATION',
  DATA_DELETION = 'DATA_DELETION',
  SYSTEM_CONFIGURATION = 'SYSTEM_CONFIGURATION',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  WORKFLOW_TRANSITION = 'WORKFLOW_TRANSITION',
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_UPDATED = 'ORDER_UPDATED',
  ORDER_APPROVED = 'ORDER_APPROVED',
  ORDER_REJECTED = 'ORDER_REJECTED',
  QUOTE_CREATED = 'QUOTE_CREATED',
  QUOTE_APPROVED = 'QUOTE_APPROVED',
  QUOTE_REJECTED = 'QUOTE_REJECTED',
  INVOICE_GENERATED = 'INVOICE_GENERATED',
  INVOICE_SENT = 'INVOICE_SENT',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PRODUCTION_STARTED = 'PRODUCTION_STARTED',
  PRODUCTION_COMPLETED = 'PRODUCTION_COMPLETED',
  SHIPMENT_CREATED = 'SHIPMENT_CREATED',
  SHIPMENT_TRACKED = 'SHIPMENT_TRACKED',
  SHIPMENT_DELIVERED = 'SHIPMENT_DELIVERED',
  EXPORT_LIQUIDATED = 'EXPORT_LIQUIDATED',
  CREDIT_VALIDATED = 'CREDIT_VALIDATED',
  REPORT_GENERATED = 'REPORT_GENERATED',
  ERROR_OCCURRED = 'ERROR_OCCURRED',
  SYSTEM_STARTUP = 'SYSTEM_STARTUP',
  SYSTEM_SHUTDOWN = 'SYSTEM_SHUTDOWN',
}

export enum AuditEventSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AuditEventType,
    comment: 'Type of audit event',
  })
  eventType: AuditEventType;

  @Column({
    type: 'enum',
    enum: AuditEventSeverity,
    default: AuditEventSeverity.MEDIUM,
    comment: 'Severity level of the event',
  })
  severity: AuditEventSeverity;

  @Column({
    type: 'text',
    comment: 'User or system component that triggered the event',
  })
  actor: string;

  @Column({ type: 'text', nullable: true, comment: 'IP address of the actor' })
  ipAddress: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'User agent or client information',
  })
  userAgent: string;

  @Column({ type: 'text', comment: 'Resource or entity affected by the event' })
  resource: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'ID of the resource affected',
  })
  resourceId: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Action performed on the resource',
  })
  action: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Additional details about the event',
  })
  details: any;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Previous state before the action',
  })
  previousState: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'New state after the action',
  })
  newState: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether the event indicates an error',
  })
  isError: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Error message if applicable',
  })
  errorMessage: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Error stack trace if applicable',
  })
  errorStack: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Session ID for tracking user sessions',
  })
  sessionId: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Request ID for tracking API requests',
  })
  requestId: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Additional context or metadata',
  })
  context: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether the event has been reviewed',
  })
  isReviewed: boolean;

  @Column({ nullable: true, comment: 'User who reviewed the event' })
  reviewedBy: string;

  @Column({ type: 'timestamp', nullable: true, comment: 'Review timestamp' })
  reviewedAt: Date;

  @Column({ type: 'text', nullable: true, comment: 'Review notes or comments' })
  reviewNotes: string;

  @CreateDateColumn({ comment: 'Timestamp when the event occurred' })
  timestamp: Date;

  // Virtual properties
  get isSecurityEvent(): boolean {
    return [
      AuditEventType.USER_LOGIN,
      AuditEventType.USER_LOGOUT,
      AuditEventType.SECURITY_VIOLATION,
    ].includes(this.eventType);
  }

  get isDataEvent(): boolean {
    return [
      AuditEventType.DATA_ACCESS,
      AuditEventType.DATA_MODIFICATION,
      AuditEventType.DATA_DELETION,
    ].includes(this.eventType);
  }

  get isBusinessEvent(): boolean {
    return [
      AuditEventType.ORDER_CREATED,
      AuditEventType.ORDER_APPROVED,
      AuditEventType.QUOTE_APPROVED,
      AuditEventType.INVOICE_GENERATED,
      AuditEventType.PAYMENT_RECEIVED,
      AuditEventType.SHIPMENT_DELIVERED,
    ].includes(this.eventType);
  }

  get timeSinceEvent(): number {
    const now = new Date();
    const diffTime = now.getTime() - this.timestamp.getTime();
    return Math.ceil(diffTime / (1000 * 60)); // Minutes
  }
}
