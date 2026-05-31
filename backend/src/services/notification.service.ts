import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationStatus,
} from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a new notification
   */
  async createNotification(
    type: NotificationType,
    priority: NotificationPriority,
    title: string,
    message: string,
    recipientId?: string,
    category?: string,
    actionUrl?: string,
    relatedEntityType?: string,
    relatedEntityId?: string,
    contextData?: any,
    scheduledAt?: Date,
  ): Promise<Notification> {
    try {
      const notification = new Notification();
      notification.type = type;
      notification.priority = priority;
      notification.title = title;
      notification.message = message;
      notification.status = NotificationStatus.UNREAD;
      notification.recipientId = recipientId ?? null;
      notification.category = category ?? null;
      notification.actionUrl = actionUrl ?? null;
      notification.relatedEntityType = relatedEntityType ?? null;
      notification.relatedEntityId = relatedEntityId ?? null;
      notification.contextData = contextData ?? null;
      notification.scheduledAt = scheduledAt ?? null;

      const savedNotification =
        await this.notificationRepository.save(notification);

      // Emit event for real-time notifications
      this.eventEmitter.emit('notification.created', savedNotification);

      this.logger.log(
        `Notification created: ${title} for recipient ${recipientId || 'all'}`,
      );
      return savedNotification;
    } catch (error) {
      this.logger.error(
        `Error creating notification: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    status?: NotificationStatus,
  ): Promise<{ notifications: Notification[]; total: number }> {
    try {
      const queryBuilder = this.notificationRepository
        .createQueryBuilder('notification')
        .where('notification.recipientId = :userId', { userId })
        .orderBy('notification.createdAt', 'DESC')
        .skip(offset)
        .take(limit);

      if (status) {
        queryBuilder.andWhere('notification.status = :status', { status });
      }

      const [notifications, total] = await queryBuilder.getManyAndCount();
      return { notifications, total };
    } catch (error) {
      this.logger.error(
        `Error fetching user notifications: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get notifications by category
   */
  async getNotificationsByCategory(
    category: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ notifications: Notification[]; total: number }> {
    try {
      const [notifications, total] =
        await this.notificationRepository.findAndCount({
          where: { category },
          order: { createdAt: 'DESC' },
          skip: offset,
          take: limit,
        });

      return { notifications, total };
    } catch (error) {
      this.logger.error(
        `Error fetching notifications by category: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(
    notificationId: string,
    userId?: string,
  ): Promise<Notification> {
    try {
      const notification = await this.notificationRepository.findOne({
        where: { id: notificationId },
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      // Check if user has permission to mark this notification as read
      if (
        userId &&
        notification.recipientId &&
        notification.recipientId !== userId
      ) {
        throw new Error(
          'User does not have permission to mark this notification as read',
        );
      }

      notification.status = NotificationStatus.READ;
      notification.readAt = new Date();

      const updatedNotification =
        await this.notificationRepository.save(notification);

      // Emit event for real-time updates
      this.eventEmitter.emit('notification.updated', updatedNotification);

      this.logger.log(`Notification marked as read: ${notificationId}`);
      return updatedNotification;
    } catch (error) {
      this.logger.error(
        `Error marking notification as read: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Mark multiple notifications as read
   */
  async markMultipleAsRead(
    notificationIds: string[],
    userId?: string,
  ): Promise<number> {
    try {
      const queryBuilder = this.notificationRepository
        .createQueryBuilder()
        .update(Notification)
        .set({
          status: NotificationStatus.READ,
          readAt: new Date(),
        })
        .where('id IN (:...ids)', { ids: notificationIds });

      if (userId) {
        queryBuilder.andWhere('recipientId = :userId', { userId });
      }

      const result = await queryBuilder.execute();
      const affectedRows = result.affected || 0;

      this.logger.log(`Marked ${affectedRows} notifications as read`);
      return affectedRows;
    } catch (error) {
      this.logger.error(
        `Error marking multiple notifications as read: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Dismiss a notification
   */
  async dismissNotification(
    notificationId: string,
    userId?: string,
  ): Promise<Notification> {
    try {
      const notification = await this.notificationRepository.findOne({
        where: { id: notificationId },
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      // Check if user has permission to dismiss this notification
      if (
        userId &&
        notification.recipientId &&
        notification.recipientId !== userId
      ) {
        throw new Error(
          'User does not have permission to dismiss this notification',
        );
      }

      notification.status = NotificationStatus.DISMISSED;

      const updatedNotification =
        await this.notificationRepository.save(notification);

      // Emit event for real-time updates
      this.eventEmitter.emit('notification.updated', updatedNotification);

      this.logger.log(`Notification dismissed: ${notificationId}`);
      return updatedNotification;
    } catch (error) {
      this.logger.error(
        `Error dismissing notification: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Archive old notifications
   */
  async archiveOldNotifications(days: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await this.notificationRepository
        .createQueryBuilder()
        .update(Notification)
        .set({ status: NotificationStatus.ARCHIVED })
        .where('createdAt < :cutoffDate', { cutoffDate })
        .andWhere('status IN (:...statuses)', {
          statuses: [NotificationStatus.READ, NotificationStatus.DISMISSED],
        })
        .execute();

      const affectedRows = result.affected || 0;

      this.logger.log(`Archived ${affectedRows} old notifications`);
      return affectedRows;
    } catch (error) {
      this.logger.error(
        `Error archiving old notifications: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const count = await this.notificationRepository.count({
        where: {
          recipientId: userId,
          status: NotificationStatus.UNREAD,
        },
      });

      return count;
    } catch (error) {
      this.logger.error(
        `Error getting unread notification count: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get high priority notifications for a user
   */
  async getHighPriorityNotifications(
    userId: string,
    limit: number = 5,
  ): Promise<Notification[]> {
    try {
      const notifications = await this.notificationRepository.find({
        where: [
          { recipientId: userId, priority: NotificationPriority.CRITICAL },
          { recipientId: userId, priority: NotificationPriority.URGENT },
          { recipientId: userId, priority: NotificationPriority.HIGH },
        ],
        order: {
          priority: 'DESC',
          createdAt: 'DESC',
        },
        take: limit,
      });

      return notifications;
    } catch (error) {
      this.logger.error(
        `Error getting high priority notifications: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Create bulk notifications
   */
  async createBulkNotifications(
    notifications: Array<{
      type: NotificationType;
      priority: NotificationPriority;
      title: string;
      message: string;
      recipientId?: string;
      category?: string;
      actionUrl?: string;
      relatedEntityType?: string;
      relatedEntityId?: string;
      contextData?: any;
    }>,
  ): Promise<Notification[]> {
    try {
      const notificationEntities = notifications.map((notificationData) => {
        const notification = new Notification();
        Object.assign(notification, notificationData);
        notification.status = NotificationStatus.UNREAD;
        return notification;
      });

      const savedNotifications =
        await this.notificationRepository.save(notificationEntities);

      // Emit events for real-time notifications
      savedNotifications.forEach((notification) => {
        this.eventEmitter.emit('notification.created', notification);
      });

      this.logger.log(
        `Created ${savedNotifications.length} bulk notifications`,
      );
      return savedNotifications;
    } catch (error) {
      this.logger.error(
        `Error creating bulk notifications: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(
    notificationId: string,
    userId?: string,
  ): Promise<boolean> {
    try {
      const notification = await this.notificationRepository.findOne({
        where: { id: notificationId },
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      // Check if user has permission to delete this notification
      if (
        userId &&
        notification.recipientId &&
        notification.recipientId !== userId
      ) {
        throw new Error(
          'User does not have permission to delete this notification',
        );
      }

      await this.notificationRepository.remove(notification);

      this.logger.log(`Notification deleted: ${notificationId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Error deleting notification: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get notification statistics for a user
   */
  async getNotificationStats(userId: string): Promise<{
    total: number;
    unread: number;
    read: number;
    dismissed: number;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
  }> {
    try {
      const stats = await this.notificationRepository
        .createQueryBuilder('notification')
        .select('notification.status', 'status')
        .addSelect('notification.priority', 'priority')
        .addSelect('notification.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .where('notification.recipientId = :userId', { userId })
        .groupBy(
          'notification.status, notification.priority, notification.type',
        )
        .getRawMany();

      const total = stats.reduce((sum, stat) => sum + parseInt(stat.count), 0);
      const unread = stats
        .filter((stat) => stat.status === NotificationStatus.UNREAD)
        .reduce((sum, stat) => sum + parseInt(stat.count), 0);
      const read = stats
        .filter((stat) => stat.status === NotificationStatus.READ)
        .reduce((sum, stat) => sum + parseInt(stat.count), 0);
      const dismissed = stats
        .filter((stat) => stat.status === NotificationStatus.DISMISSED)
        .reduce((sum, stat) => sum + parseInt(stat.count), 0);

      const byPriority = stats.reduce((acc, stat) => {
        acc[stat.priority] = (acc[stat.priority] || 0) + parseInt(stat.count);
        return acc;
      }, {});

      const byType = stats.reduce((acc, stat) => {
        acc[stat.type] = (acc[stat.type] || 0) + parseInt(stat.count);
        return acc;
      }, {});

      return {
        total,
        unread,
        read,
        dismissed,
        byPriority,
        byType,
      };
    } catch (error) {
      this.logger.error(
        `Error getting notification stats: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
