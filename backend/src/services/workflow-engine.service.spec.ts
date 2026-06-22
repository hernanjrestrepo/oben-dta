import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowEngineService } from './workflow-engine.service';
import {
  WorkflowEvent,
  WorkflowEventType,
  WorkflowEventStatus,
} from '../entities/workflow-event.entity';
import {
  ProductionOrder,
  ProductionOrderStatus,
} from '../entities/production-order.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import {
  CreditValidation,
  CreditValidationStatus,
} from '../entities/credit-validation.entity';
import {
  PackingList,
  PackingListStatus,
} from '../entities/packing-list.entity';
import { Shipment, ShipmentStatus } from '../entities/shipment.entity';
import {
  Notification,
  NotificationType,
  NotificationPriority,
} from '../entities/notification.entity';
import { User } from '../entities/user.entity';

describe('WorkflowEngineService', () => {
  let service: WorkflowEngineService;
  let workflowEventRepository: MockRepository<WorkflowEvent>;
  let productionOrderRepository: MockRepository<ProductionOrder>;
  let orderRepository: MockRepository<Order>;
  let creditValidationRepository: MockRepository<CreditValidation>;
  let packingListRepository: MockRepository<PackingList>;
  let shipmentRepository: MockRepository<Shipment>;
  let notificationRepository: MockRepository<Notification>;
  let userRepository: MockRepository<User>;

  // Type for mock repository
  type MockRepository<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

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

  const mockProductionOrder: ProductionOrder = {
    id: 'po-1',
    productionOrderNumber: 'PO-001',
    orderId: 'order-1',
    productId: 'product-1',
    status: ProductionOrderStatus.PENDING,
    priority: 'NORMAL',
    quantity: 100,
    completedQuantity: 0,
    remainingQuantity: 100,
    scheduledStartDate: new Date(),
    actualStartDate: null,
    scheduledCompletionDate: new Date(),
    actualCompletionDate: null,
    estimatedProductionTime: 8,
    actualProductionTime: 0,
    qualityChecksPassed: false,
    yieldPercentage: 0,
    productionCost: 0,
    requiresSpecialApproval: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    progressPercentage: 0,
    isCompleted: false,
    isInProgress: false,
    isOverdue: false,
    remainingTime: 0,
  };

  const mockOrder: Order = {
    id: 'order-1',
    orderNumber: 'ORD-001',
    clientId: 'client-1',
    totalAmount: 1000,
    status: OrderStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCreditValidation: CreditValidation = {
    id: 'cv-1',
    validationNumber: 'CV-001',
    orderId: 'order-1',
    clientId: 'client-1',
    status: CreditValidationStatus.PENDING,
    type: 'AUTOMATIC',
    orderAmount: 1000,
    creditLimit: 5000,
    usedCredit: 2000,
    availableCredit: 3000,
    utilizationPercentage: 40,
    isCreditSufficient: true,
    creditScore: 85,
    createdAt: new Date(),
    updatedAt: new Date(),
    isExpired: false,
    isValid: false,
    creditRemainingAfterOrder: 0,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowEngineService,
        {
          provide: getRepositoryToken(WorkflowEvent),
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
          provide: getRepositoryToken(ProductionOrder),
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
          provide: getRepositoryToken(Order),
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
          provide: getRepositoryToken(CreditValidation),
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
          provide: getRepositoryToken(PackingList),
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
          provide: getRepositoryToken(Shipment),
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
          provide: getRepositoryToken(Notification),
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
      ],
    }).compile();

    service = module.get<WorkflowEngineService>(WorkflowEngineService);
    workflowEventRepository = module.get(getRepositoryToken(WorkflowEvent));
    productionOrderRepository = module.get(getRepositoryToken(ProductionOrder));
    orderRepository = module.get(getRepositoryToken(Order));
    creditValidationRepository = module.get(
      getRepositoryToken(CreditValidation),
    );
    packingListRepository = module.get(getRepositoryToken(PackingList));
    shipmentRepository = module.get(getRepositoryToken(Shipment));
    notificationRepository = module.get(getRepositoryToken(Notification));
    userRepository = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWorkflowEvent', () => {
    it('should create a workflow event', async () => {
      const mockWorkflowEvent = new WorkflowEvent();
      mockWorkflowEvent.id = 'event-1';
      mockWorkflowEvent.eventType = WorkflowEventType.STATE_TRANSITION;
      mockWorkflowEvent.workflowName = 'TestWorkflow';
      mockWorkflowEvent.fromState = 'PENDING';
      mockWorkflowEvent.toState = 'APPROVED';
      mockWorkflowEvent.action = 'approve';
      mockWorkflowEvent.entityType = 'Order';
      mockWorkflowEvent.entityId = 'order-1';
      mockWorkflowEvent.status = WorkflowEventStatus.PENDING;

      (workflowEventRepository.save as jest.Mock).mockResolvedValue(
        mockWorkflowEvent,
      );

      const result = await service.createWorkflowEvent(
        WorkflowEventType.STATE_TRANSITION,
        'TestWorkflow',
        'PENDING',
        'APPROVED',
        'approve',
        'Order',
        'order-1',
        'user-1',
        { reason: 'test' },
        { context: 'test' },
      );

      expect(result).toEqual(mockWorkflowEvent);
      expect(workflowEventRepository.save).toHaveBeenCalled();
    });
  });

  describe('executeProductionOrderTransition', () => {
    it('should successfully start a production order', async () => {
      const productionOrder = {
        ...mockProductionOrder,
        status: ProductionOrderStatus.SCHEDULED,
      };
      (productionOrderRepository.findOne as jest.Mock).mockResolvedValue(
        productionOrder,
      );
      (workflowEventRepository.save as jest.Mock).mockImplementation((event) =>
        Promise.resolve(event),
      );
      (productionOrderRepository.save as jest.Mock).mockImplementation((po) =>
        Promise.resolve(po),
      );
      (notificationRepository.save as jest.Mock).mockImplementation(
        (notification) => Promise.resolve(notification),
      );

      const result = await service.executeProductionOrderTransition(
        'po-1',
        'start',
        'user-1',
        'Test start',
      );

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe(ProductionOrderStatus.IN_PROGRESS);
      expect(productionOrderRepository.save).toHaveBeenCalled();
      expect(workflowEventRepository.save).toHaveBeenCalledTimes(3);
    });

    it('should fail when trying to start a production order that is not scheduled', async () => {
      const productionOrder = {
        ...mockProductionOrder,
        status: ProductionOrderStatus.PENDING,
      };
      (productionOrderRepository.findOne as jest.Mock).mockResolvedValue(
        productionOrder,
      );
      (workflowEventRepository.save as jest.Mock).mockImplementation((event) =>
        Promise.resolve(event),
      );

      const result = await service.executeProductionOrderTransition(
        'po-1',
        'start',
        'user-1',
        'Test start',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid transition');
    });

    it('should fail when production order is not found', async () => {
      (productionOrderRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.executeProductionOrderTransition(
        'po-999',
        'start',
        'user-1',
        'Test start',
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Production order not found');
    });
  });

  describe('executeOrderTransition', () => {
    it('should successfully approve a pending order', async () => {
      const order = { ...mockOrder, status: OrderStatus.PENDING_VALIDATION };
      (orderRepository.findOne as jest.Mock).mockResolvedValue(order);
      (workflowEventRepository.save as jest.Mock).mockImplementation((event) =>
        Promise.resolve(event),
      );
      (orderRepository.save as jest.Mock).mockImplementation((o) =>
        Promise.resolve(o),
      );
      (notificationRepository.save as jest.Mock).mockImplementation(
        (notification) => Promise.resolve(notification),
      );

      const result = await service.executeOrderTransition(
        'order-1',
        'approve',
        'user-1',
        'Test approval',
      );

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe(OrderStatus.CONFIRMED);
      expect(orderRepository.save).toHaveBeenCalled();
      expect(workflowEventRepository.save).toHaveBeenCalledTimes(3);
    });

    it('should fail when trying to approve an order that is not pending', async () => {
      const order = { ...mockOrder, status: OrderStatus.APPROVED };
      (orderRepository.findOne as jest.Mock).mockResolvedValue(order);
      (workflowEventRepository.save as jest.Mock).mockImplementation((event) =>
        Promise.resolve(event),
      );

      const result = await service.executeOrderTransition(
        'order-1',
        'approve',
        'user-1',
        'Test approval',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid transition');
    });
  });

  describe('executeCreditValidationTransition', () => {
    it('should successfully approve a pending credit validation', async () => {
      const creditValidation = {
        ...mockCreditValidation,
        status: CreditValidationStatus.PENDING,
      };
      (creditValidationRepository.findOne as jest.Mock).mockResolvedValue(
        creditValidation,
      );
      (workflowEventRepository.save as jest.Mock).mockImplementation((event) =>
        Promise.resolve(event),
      );
      (creditValidationRepository.save as jest.Mock).mockImplementation((cv) =>
        Promise.resolve(cv),
      );
      (notificationRepository.save as jest.Mock).mockImplementation(
        (notification) => Promise.resolve(notification),
      );

      const result = await service.executeCreditValidationTransition(
        'cv-1',
        'approve',
        'user-1',
        'Test approval',
      );

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe(CreditValidationStatus.APPROVED);
      expect(creditValidationRepository.save).toHaveBeenCalled();
      expect(workflowEventRepository.save).toHaveBeenCalledTimes(3);
    });

    it('should fail when trying to approve a credit validation that is not pending', async () => {
      const creditValidation = {
        ...mockCreditValidation,
        status: CreditValidationStatus.APPROVED,
      };
      (creditValidationRepository.findOne as jest.Mock).mockResolvedValue(
        creditValidation,
      );
      (workflowEventRepository.save as jest.Mock).mockImplementation((event) =>
        Promise.resolve(event),
      );

      const result = await service.executeCreditValidationTransition(
        'cv-1',
        'approve',
        'user-1',
        'Test approval',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid transition');
    });
  });

  describe('getWorkflowEvents', () => {
    it('should return workflow events for an entity', async () => {
      const mockEvents = [
        { id: 'event-1', entityType: 'Order', entityId: 'order-1' },
        { id: 'event-2', entityType: 'Order', entityId: 'order-1' },
      ];
      (workflowEventRepository.find as jest.Mock).mockResolvedValue(mockEvents);

      const result = await service.getWorkflowEvents('Order', 'order-1');

      expect(result).toEqual(mockEvents);
      expect(workflowEventRepository.find).toHaveBeenCalledWith({
        where: { entityType: 'Order', entityId: 'order-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('retryWorkflowEvent', () => {
    it('should successfully retry a failed workflow event', async () => {
      const failedEvent = new WorkflowEvent();
      failedEvent.id = 'event-1';
      failedEvent.status = WorkflowEventStatus.FAILED;
      failedEvent.retryCount = 1;

      (workflowEventRepository.findOne as jest.Mock).mockResolvedValue(
        failedEvent,
      );
      (workflowEventRepository.save as jest.Mock).mockImplementation((event) =>
        Promise.resolve(event),
      );

      const result = await service.retryWorkflowEvent('event-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Event marked for retry');
      expect(failedEvent.status).toBe(WorkflowEventStatus.PENDING);
      expect(failedEvent.retryCount).toBe(2);
      expect(workflowEventRepository.save).toHaveBeenCalled();
    });

    it('should fail when trying to retry a non-failed event', async () => {
      const pendingEvent = new WorkflowEvent();
      pendingEvent.id = 'event-1';
      pendingEvent.status = WorkflowEventStatus.PENDING;

      (workflowEventRepository.findOne as jest.Mock).mockResolvedValue(
        pendingEvent,
      );

      const result = await service.retryWorkflowEvent('event-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Only failed events can be retried');
    });

    it('should fail when workflow event is not found', async () => {
      (workflowEventRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.retryWorkflowEvent('event-999');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Workflow event not found');
    });
  });
});
