import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

export enum NotificationType {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
  ALERT = 'ALERT',
  REMINDER = 'REMINDER',
  APPROVAL = 'APPROVAL',
  SYSTEM = 'SYSTEM',
}

export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
  CRITICAL = 'CRITICAL',
}

export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
  ARCHIVED = 'ARCHIVED',
  DISMISSED = 'DISMISSED',
}

@Entity('notifications')
export class Notification extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.INFO,
  })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.NORMAL,
  })
  priority: NotificationPriority;

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.UNREAD,
  })
  status: NotificationStatus;

  @Column({ type: 'text', comment: 'Notification title or subject' })
  title: string;

  @Column({ type: 'text', comment: 'Detailed notification message' })
  message: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Category or module for filtering',
  })
  category: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'URL or route for navigation',
  })
  actionUrl: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Entity type related to notification',
  })
  relatedEntityType: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Entity ID related to notification',
  })
  relatedEntityId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'recipient_id' })
  recipient: User;

  @Column({ name: 'recipient_id', nullable: true })
  recipientId: string | null;

  @Column({ type: 'jsonb', nullable: true, comment: 'Additional context data' })
  contextData: any;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When notification should be sent',
  })
  scheduledAt: Date | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When notification was read',
  })
  readAt: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'User who acknowledged notification',
  })
  acknowledgedBy: string;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When notification was acknowledged',
  })
  acknowledgedAt: Date;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether notification requires action',
  })
  requiresAction: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Action taken on notification',
  })
  actionTaken: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether notification is persistent',
  })
  isPersistent: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Group or channel for bulk operations',
  })
  group: string;

  @Column({ type: 'text', nullable: true, comment: 'External reference ID' })
  referenceId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  updatedBy: string;

  // Virtual properties
  get isUnread(): boolean {
    return this.status === NotificationStatus.UNREAD;
  }

  get isHighPriority(): boolean {
    return (
      this.priority === NotificationPriority.HIGH ||
      this.priority === NotificationPriority.URGENT ||
      this.priority === NotificationPriority.CRITICAL
    );
  }

  get timeSinceCreation(): number {
    const now = new Date();
    const diffTime = now.getTime() - this.createdAt.getTime();
    return Math.ceil(diffTime / (1000 * 60)); // Minutes
  }
}
