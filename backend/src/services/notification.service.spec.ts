import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationService } from './notification.service';
import {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationStatus,
} from '../entities/notification.entity';
import { User } from '../entities/user.entity';

describe('NotificationService', () => {
  let service: NotificationService;
  let notificationRepository: MockRepository<Notification>;
  let userRepository: MockRepository<User>;
  let eventEmitter: MockEventEmitter;

  // Type for mock repository
  type MockRepository<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;
  type MockEventEmitter = Partial<Record<keyof EventEmitter2, jest.Mock>>;

  // Mock data
  const mockUser: User = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashedpassword',
    isActive: true,
    roles: ['user'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockNotification: Notification = {
    id: 'notification-1',
    type: NotificationType.INFO,
    priority: NotificationPriority.NORMAL,
    status: NotificationStatus.UNREAD,
    title: 'Test Notification',
    message: 'This is a test notification',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(Notification),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            count: jest.fn(),
            findAndCount: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
              getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
              getOne: jest.fn().mockResolvedValue(null),
              getCount: jest.fn().mockResolvedValue(0),
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ affected: 0 }),
              remove: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              innerJoin: jest.fn().mockReturnThis(),
              getRawMany: jest.fn().mockResolvedValue([]),
              getRawOne: jest.fn().mockResolvedValue(null),
            })),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
              getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
              getOne: jest.fn().mockResolvedValue(null),
              getCount: jest.fn().mockResolvedValue(0),
            })),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    notificationRepository = module.get(getRepositoryToken(Notification));
    userRepository = module.get(getRepositoryToken(User));
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createNotification', () => {
    it('should create a notification and emit event', async () => {
      const mockSavedNotification = {
        ...mockNotification,
        id: 'notification-1',
      };
      (notificationRepository.save as jest.Mock).mockResolvedValue(
        mockSavedNotification,
      );

      const result = await service.createNotification(
        NotificationType.INFO,
        NotificationPriority.NORMAL,
        'Test Notification',
        'This is a test notification',
        'user-1',
        'test-category',
        '/test-url',
        'TestEntity',
        'entity-1',
        { testData: 'value' },
        new Date(),
      );

      expect(result).toEqual(mockSavedNotification);
      expect(notificationRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.created',
        mockSavedNotification,
      );
    });

    it('should create a notification without optional parameters', async () => {
      const mockSavedNotification = {
        ...mockNotification,
        id: 'notification-2',
      };
      (notificationRepository.save as jest.Mock).mockResolvedValue(
        mockSavedNotification,
      );

      const result = await service.createNotification(
        NotificationType.WARNING,
        NotificationPriority.HIGH,
        'Another Test',
        'Another test notification',
      );

      expect(result).toEqual(mockSavedNotification);
      expect(notificationRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.created',
        mockSavedNotification,
      );
    });
  });

  describe('getUserNotifications', () => {
    it('should return user notifications with pagination', async () => {
      const mockNotifications = [
        { ...mockNotification, id: 'notification-1' },
        {
          ...mockNotification,
          id: 'notification-2',
          title: 'Second Notification',
        },
      ];
      const mockCount = 2;

      (notificationRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([mockNotifications, mockCount]),
      });

      const result = await service.getUserNotifications(
        'user-1',
        10,
        0,
        NotificationStatus.UNREAD,
      );

      expect(result.notifications).toEqual(mockNotifications);
      expect(result.total).toBe(mockCount);
    });

    it('should return user notifications without status filter', async () => {
      const mockNotifications = [{ ...mockNotification, id: 'notification-1' }];
      const mockCount = 1;

      (notificationRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([mockNotifications, mockCount]),
      });

      const result = await service.getUserNotifications('user-1', 5, 0);

      expect(result.notifications).toEqual(mockNotifications);
      expect(result.total).toBe(mockCount);
    });
  });

  describe('getNotificationsByCategory', () => {
    it('should return notifications by category', async () => {
      const mockNotifications = [
        {
          ...mockNotification,
          id: 'notification-1',
          category: 'test-category',
        },
        {
          ...mockNotification,
          id: 'notification-2',
          category: 'test-category',
        },
      ];
      const mockCount = 2;

      (notificationRepository.findAndCount as jest.Mock).mockResolvedValue([
        mockNotifications,
        mockCount,
      ]);

      const result = await service.getNotificationsByCategory(
        'test-category',
        10,
        0,
      );

      expect(result.notifications).toEqual(mockNotifications);
      expect(result.total).toBe(mockCount);
      expect(notificationRepository.findAndCount).toHaveBeenCalledWith({
        where: { category: 'test-category' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read and emit event', async () => {
      const mockNotificationToUpdate = {
        ...mockNotification,
        status: NotificationStatus.UNREAD,
      };
      const mockUpdatedNotification = {
        ...mockNotification,
        status: NotificationStatus.READ,
        readAt: new Date(),
      };

      (notificationRepository.findOne as jest.Mock).mockResolvedValue(
        mockNotificationToUpdate,
      );
      (notificationRepository.save as jest.Mock).mockResolvedValue(
        mockUpdatedNotification,
      );

      const result = await service.markAsRead('notification-1', 'user-1');

      expect(result.status).toBe(NotificationStatus.READ);
      expect(result.readAt).toBeDefined();
      expect(notificationRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.updated',
        mockUpdatedNotification,
      );
    });

    it('should fail when notification is not found', async () => {
      (notificationRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.markAsRead('notification-999', 'user-1'),
      ).rejects.toThrow('Notification not found');
    });

    it('should fail when user does not have permission', async () => {
      const mockNotificationToUpdate = {
        ...mockNotification,
        recipientId: 'user-2',
      };
      (notificationRepository.findOne as jest.Mock).mockResolvedValue(
        mockNotificationToUpdate,
      );

      await expect(
        service.markAsRead('notification-1', 'user-1'),
      ).rejects.toThrow(
        'User does not have permission to mark this notification as read',
      );
    });
  });

  describe('markMultipleAsRead', () => {
    it('should mark multiple notifications as read', async () => {
      const notificationIds = ['notification-1', 'notification-2'];
      const mockResult = { affected: 2 };

      (notificationRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(mockResult),
      });

      const result = await service.markMultipleAsRead(
        notificationIds,
        'user-1',
      );

      expect(result).toBe(2);
      expect(
        notificationRepository.createQueryBuilder().execute,
      ).toHaveBeenCalled();
    });

    it('should mark multiple notifications as read without user filter', async () => {
      const notificationIds = ['notification-1', 'notification-2'];
      const mockResult = { affected: 2 };

      (notificationRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(mockResult),
      });

      const result = await service.markMultipleAsRead(notificationIds);

      expect(result).toBe(2);
      expect(
        notificationRepository.createQueryBuilder().execute,
      ).toHaveBeenCalled();
    });
  });

  describe('dismissNotification', () => {
    it('should dismiss a notification and emit event', async () => {
      const mockNotificationToDismiss = {
        ...mockNotification,
        status: NotificationStatus.UNREAD,
      };
      const mockDismissedNotification = {
        ...mockNotification,
        status: NotificationStatus.DISMISSED,
      };

      (notificationRepository.findOne as jest.Mock).mockResolvedValue(
        mockNotificationToDismiss,
      );
      (notificationRepository.save as jest.Mock).mockResolvedValue(
        mockDismissedNotification,
      );

      const result = await service.dismissNotification(
        'notification-1',
        'user-1',
      );

      expect(result.status).toBe(NotificationStatus.DISMISSED);
      expect(notificationRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.updated',
        mockDismissedNotification,
      );
    });

    it('should fail when notification is not found', async () => {
      (notificationRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.dismissNotification('notification-999', 'user-1'),
      ).rejects.toThrow('Notification not found');
    });
  });

  describe('archiveOldNotifications', () => {
    it('should archive old notifications', async () => {
      const mockResult = { affected: 5 };

      (notificationRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(mockResult),
      });

      const result = await service.archiveOldNotifications(30);

      expect(result).toBe(5);
      expect(
        notificationRepository.createQueryBuilder().execute,
      ).toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread notification count for user', async () => {
      (notificationRepository.count as jest.Mock).mockResolvedValue(3);

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(3);
      expect(notificationRepository.count).toHaveBeenCalledWith({
        where: {
          recipientId: 'user-1',
          status: NotificationStatus.UNREAD,
        },
      });
    });
  });

  describe('getHighPriorityNotifications', () => {
    it('should return high priority notifications for user', async () => {
      const mockHighPriorityNotifications = [
        {
          ...mockNotification,
          id: 'notification-1',
          priority: NotificationPriority.CRITICAL,
        },
        {
          ...mockNotification,
          id: 'notification-2',
          priority: NotificationPriority.URGENT,
        },
      ];

      (notificationRepository.find as jest.Mock).mockResolvedValue(
        mockHighPriorityNotifications,
      );

      const result = await service.getHighPriorityNotifications('user-1', 5);

      expect(result).toEqual(mockHighPriorityNotifications);
      expect(notificationRepository.find).toHaveBeenCalled();
    });
  });

  describe('createBulkNotifications', () => {
    it('should create bulk notifications and emit events', async () => {
      const notifications = [
        {
          type: NotificationType.INFO,
          priority: NotificationPriority.NORMAL,
          title: 'Bulk Notification 1',
          message: 'First bulk notification',
          recipientId: 'user-1',
        },
        {
          type: NotificationType.WARNING,
          priority: NotificationPriority.HIGH,
          title: 'Bulk Notification 2',
          message: 'Second bulk notification',
          recipientId: 'user-2',
        },
      ];

      const mockSavedNotifications = notifications.map((notif, index) => ({
        ...notif,
        id: `bulk-${index + 1}`,
        status: NotificationStatus.UNREAD,
      }));

      (notificationRepository.save as jest.Mock).mockResolvedValue(
        mockSavedNotifications,
      );

      const result = await service.createBulkNotifications(notifications);

      expect(result).toEqual(mockSavedNotifications);
      expect(notificationRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteNotification', () => {
    it('should delete a notification', async () => {
      const mockNotificationToDelete = {
        ...mockNotification,
        recipientId: 'user-1',
      };

      (notificationRepository.findOne as jest.Mock).mockResolvedValue(
        mockNotificationToDelete,
      );
      (notificationRepository.remove as jest.Mock).mockResolvedValue(undefined);

      const result = await service.deleteNotification(
        'notification-1',
        'user-1',
      );

      expect(result).toBe(true);
      expect(notificationRepository.remove).toHaveBeenCalled();
    });

    it('should fail when notification is not found', async () => {
      (notificationRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.deleteNotification('notification-999', 'user-1'),
      ).rejects.toThrow('Notification not found');
    });
  });

  describe('getNotificationStats', () => {
    it('should return notification statistics for user', async () => {
      const mockStats = [
        { status: 'UNREAD', priority: 'NORMAL', type: 'INFO', count: '5' },
        { status: 'READ', priority: 'HIGH', type: 'WARNING', count: '3' },
        { status: 'DISMISSED', priority: 'NORMAL', type: 'INFO', count: '2' },
      ];

      (notificationRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockStats),
      });

      const result = await service.getNotificationStats('user-1');

      expect(result).toBeDefined();
      expect(result.total).toBe(10);
      expect(result.unread).toBe(5);
      expect(result.read).toBe(3);
      expect(result.dismissed).toBe(2);
      expect(notificationRepository.createQueryBuilder).toHaveBeenCalled();
    });
  });
});
