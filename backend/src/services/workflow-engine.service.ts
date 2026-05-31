import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  NotificationStatus,
} from '../entities/notification.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    @InjectRepository(WorkflowEvent)
    private workflowEventRepository: Repository<WorkflowEvent>,

    @InjectRepository(ProductionOrder)
    private productionOrderRepository: Repository<ProductionOrder>,

    @InjectRepository(Order)
    private orderRepository: Repository<Order>,

    @InjectRepository(CreditValidation)
    private creditValidationRepository: Repository<CreditValidation>,

    @InjectRepository(PackingList)
    private packingListRepository: Repository<PackingList>,

    @InjectRepository(Shipment)
    private shipmentRepository: Repository<Shipment>,

    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,

    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Create a workflow event
   */
  async createWorkflowEvent(
    eventType: WorkflowEventType,
    workflowName: string,
    fromState: string,
    toState: string,
    action: string,
    entityType: string,
    entityId: string,
    actorId?: string,
    inputData?: any,
    context?: any,
  ): Promise<WorkflowEvent> {
    const event = new WorkflowEvent();
    event.eventType = eventType;
    event.workflowName = workflowName;
    event.fromState = fromState;
    event.toState = toState;
    event.action = action;
    event.entityType = entityType;
    event.entityId = entityId;
    event.status = WorkflowEventStatus.PENDING;
    event.inputData = inputData;
    event.context = context;

    if (actorId) {
      event.actorId = actorId;
    }

    return await this.workflowEventRepository.save(event);
  }

  /**
   * Execute a workflow transition for Production Order
   */
  async executeProductionOrderTransition(
    productionOrderId: string,
    action: string,
    actorId?: string,
    reason?: string,
  ): Promise<{
    success: boolean;
    message: string;
    newStatus?: ProductionOrderStatus;
  }> {
    try {
      const productionOrder = await this.productionOrderRepository.findOne({
        where: { id: productionOrderId },
      });

      if (!productionOrder) {
        return { success: false, message: 'Production order not found' };
      }

      // Create workflow event
      const workflowEvent = await this.createWorkflowEvent(
        WorkflowEventType.STATE_TRANSITION,
        'ProductionOrderWorkflow',
        productionOrder.status,
        productionOrder.status, // Will be updated after transition
        action,
        'ProductionOrder',
        productionOrderId,
        actorId,
        { action, reason },
        { currentStatus: productionOrder.status },
      );

      workflowEvent.startedAt = new Date();
      workflowEvent.status = WorkflowEventStatus.PROCESSING;
      await this.workflowEventRepository.save(workflowEvent);

      // Determine next status based on action
      let newStatus: ProductionOrderStatus | null = null;
      switch (action) {
        case 'start':
          if (productionOrder.status === ProductionOrderStatus.SCHEDULED) {
            newStatus = ProductionOrderStatus.IN_PROGRESS;
            productionOrder.actualStartDate = new Date();
          }
          break;

        case 'hold':
          if (productionOrder.status === ProductionOrderStatus.IN_PROGRESS) {
            newStatus = ProductionOrderStatus.ON_HOLD;
            productionOrder.heldAt = new Date();
            productionOrder.heldBy = actorId ?? null;
            productionOrder.holdReason = reason ?? null;
          }
          break;

        case 'resume':
          if (productionOrder.status === ProductionOrderStatus.ON_HOLD) {
            newStatus = ProductionOrderStatus.IN_PROGRESS;
            productionOrder.heldAt = null;
            productionOrder.heldBy = null;
            productionOrder.holdReason = null;
          }
          break;

        case 'complete':
          if (productionOrder.status === ProductionOrderStatus.IN_PROGRESS) {
            newStatus = ProductionOrderStatus.COMPLETED;
            productionOrder.actualCompletionDate = new Date();
            productionOrder.completedQuantity = productionOrder.quantity;
            productionOrder.remainingQuantity = 0;
          }
          break;

        case 'cancel':
          if (
            [
              ProductionOrderStatus.PENDING,
              ProductionOrderStatus.SCHEDULED,
              ProductionOrderStatus.IN_PROGRESS,
            ].includes(productionOrder.status)
          ) {
            newStatus = ProductionOrderStatus.CANCELLED;
            productionOrder.actualCompletionDate = new Date();
          }
          break;

        default:
          workflowEvent.status = WorkflowEventStatus.FAILED;
          workflowEvent.errorMessage = `Unknown action: ${action}`;
          workflowEvent.completedAt = new Date();
          await this.workflowEventRepository.save(workflowEvent);
          return { success: false, message: `Unknown action: ${action}` };
      }

      if (!newStatus) {
        workflowEvent.status = WorkflowEventStatus.FAILED;
        workflowEvent.errorMessage = `Invalid transition: ${productionOrder.status} -> ${action}`;
        workflowEvent.completedAt = new Date();
        await this.workflowEventRepository.save(workflowEvent);
        return {
          success: false,
          message: `Invalid transition: ${productionOrder.status} -> ${action}`,
        };
      }

      // Update production order
      productionOrder.status = newStatus;
      await this.productionOrderRepository.save(productionOrder);

      // Update workflow event
      workflowEvent.toState = newStatus;
      workflowEvent.status = WorkflowEventStatus.COMPLETED;
      workflowEvent.completedAt = new Date();
      workflowEvent.reason = reason ?? null;
      await this.workflowEventRepository.save(workflowEvent);

      // Create notification
      await this.createNotification(
        NotificationType.INFO,
        NotificationPriority.NORMAL,
        `Production Order Status Changed`,
        `Production order ${productionOrder.productionOrderNumber} status changed from ${productionOrder.status} to ${newStatus}`,
        productionOrder.assignedTo,
        'ProductionOrder',
        productionOrderId,
      );

      return {
        success: true,
        message: 'Transition executed successfully',
        newStatus,
      };
    } catch (error) {
      this.logger.error(
        `Error executing production order transition: ${error.message}`,
        error.stack,
      );
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * Execute a workflow transition for Order
   */
  async executeOrderTransition(
    orderId: string,
    action: string,
    actorId?: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string; newStatus?: OrderStatus }> {
    try {
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
      });

      if (!order) {
        return { success: false, message: 'Order not found' };
      }

      // Create workflow event
      const workflowEvent = await this.createWorkflowEvent(
        WorkflowEventType.STATE_TRANSITION,
        'OrderWorkflow',
        order.status,
        order.status, // Will be updated after transition
        action,
        'Order',
        orderId,
        actorId,
        { action, reason },
        { currentStatus: order.status },
      );

      workflowEvent.startedAt = new Date();
      workflowEvent.status = WorkflowEventStatus.PROCESSING;
      await this.workflowEventRepository.save(workflowEvent);

      // Determine next status based on action
      let newStatus: OrderStatus | null = null;
      switch (action) {
        case 'approve':
          if (order.status === OrderStatus.PENDING_VALIDATION) {
            newStatus = OrderStatus.CONFIRMED;
          }
          break;

        case 'reject':
          if (order.status === OrderStatus.PENDING_VALIDATION) {
            newStatus = OrderStatus.CANCELLED;
          }
          break;

        case 'confirm':
          if (order.status === OrderStatus.CONFIRMED) {
            newStatus = OrderStatus.CONFIRMED;
          }
          break;

        case 'cancel':
          if (
            [OrderStatus.PENDING_VALIDATION, OrderStatus.CONFIRMED].includes(
              order.status,
            )
          ) {
            newStatus = OrderStatus.CANCELLED;
          }
          break;

        default:
          workflowEvent.status = WorkflowEventStatus.FAILED;
          workflowEvent.errorMessage = `Unknown action: ${action}`;
          workflowEvent.completedAt = new Date();
          await this.workflowEventRepository.save(workflowEvent);
          return { success: false, message: `Unknown action: ${action}` };
      }

      if (!newStatus) {
        workflowEvent.status = WorkflowEventStatus.FAILED;
        workflowEvent.errorMessage = `Invalid transition: ${order.status} -> ${action}`;
        workflowEvent.completedAt = new Date();
        await this.workflowEventRepository.save(workflowEvent);
        return {
          success: false,
          message: `Invalid transition: ${order.status} -> ${action}`,
        };
      }

      // Update order
      order.status = newStatus;
      await this.orderRepository.save(order);

      // Update workflow event
      workflowEvent.toState = newStatus;
      workflowEvent.status = WorkflowEventStatus.COMPLETED;
      workflowEvent.completedAt = new Date();
      workflowEvent.reason = reason ?? null;
      await this.workflowEventRepository.save(workflowEvent);

      // Create notification
      await this.createNotification(
        NotificationType.INFO,
        NotificationPriority.NORMAL,
        `Order Status Changed`,
        `Order ${order.orderNumber} status changed from ${order.status} to ${newStatus}`,
        order.clientId,
        'Order',
        orderId,
      );

      return {
        success: true,
        message: 'Transition executed successfully',
        newStatus,
      };
    } catch (error) {
      this.logger.error(
        `Error executing order transition: ${error.message}`,
        error.stack,
      );
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * Execute a workflow transition for Credit Validation
   */
  async executeCreditValidationTransition(
    creditValidationId: string,
    action: string,
    actorId?: string,
    reason?: string,
  ): Promise<{
    success: boolean;
    message: string;
    newStatus?: CreditValidationStatus;
  }> {
    try {
      const creditValidation = await this.creditValidationRepository.findOne({
        where: { id: creditValidationId },
      });

      if (!creditValidation) {
        return { success: false, message: 'Credit validation not found' };
      }

      // Create workflow event
      const workflowEvent = await this.createWorkflowEvent(
        WorkflowEventType.STATE_TRANSITION,
        'CreditValidationWorkflow',
        creditValidation.status,
        creditValidation.status, // Will be updated after transition
        action,
        'CreditValidation',
        creditValidationId,
        actorId,
        { action, reason },
        { currentStatus: creditValidation.status },
      );

      workflowEvent.startedAt = new Date();
      workflowEvent.status = WorkflowEventStatus.PROCESSING;
      await this.workflowEventRepository.save(workflowEvent);

      // Determine next status based on action
      let newStatus: CreditValidationStatus | null = null;
      switch (action) {
        case 'approve':
          if (creditValidation.status === CreditValidationStatus.PENDING) {
            newStatus = CreditValidationStatus.APPROVED;
            creditValidation.validatedAt = new Date();
            creditValidation.validatedBy = actorId ?? null;
          }
          break;

        case 'reject':
          if (creditValidation.status === CreditValidationStatus.PENDING) {
            newStatus = CreditValidationStatus.REJECTED;
            creditValidation.validatedAt = new Date();
            creditValidation.validatedBy = actorId ?? null;
          }
          break;

        case 'escalate':
          if (creditValidation.status === CreditValidationStatus.PENDING) {
            newStatus = CreditValidationStatus.ESCALATED;
          }
          break;

        default:
          workflowEvent.status = WorkflowEventStatus.FAILED;
          workflowEvent.errorMessage = `Unknown action: ${action}`;
          workflowEvent.completedAt = new Date();
          await this.workflowEventRepository.save(workflowEvent);
          return { success: false, message: `Unknown action: ${action}` };
      }

      if (!newStatus) {
        workflowEvent.status = WorkflowEventStatus.FAILED;
        workflowEvent.errorMessage = `Invalid transition: ${creditValidation.status} -> ${action}`;
        workflowEvent.completedAt = new Date();
        await this.workflowEventRepository.save(workflowEvent);
        return {
          success: false,
          message: `Invalid transition: ${creditValidation.status} -> ${action}`,
        };
      }

      // Update credit validation
      creditValidation.status = newStatus;
      creditValidation.decisionReason = reason ?? null;
      await this.creditValidationRepository.save(creditValidation);

      // Update workflow event
      workflowEvent.toState = newStatus;
      workflowEvent.status = WorkflowEventStatus.COMPLETED;
      workflowEvent.completedAt = new Date();
      workflowEvent.reason = reason ?? null;
      await this.workflowEventRepository.save(workflowEvent);

      // Create notification
      await this.createNotification(
        newStatus === CreditValidationStatus.APPROVED
          ? NotificationType.SUCCESS
          : NotificationType.WARNING,
        NotificationPriority.HIGH,
        `Credit Validation ${newStatus}`,
        `Credit validation ${creditValidation.validationNumber} has been ${newStatus.toLowerCase()}`,
        creditValidation.clientId,
        'CreditValidation',
        creditValidationId,
      );

      return {
        success: true,
        message: 'Transition executed successfully',
        newStatus,
      };
    } catch (error) {
      this.logger.error(
        `Error executing credit validation transition: ${error.message}`,
        error.stack,
      );
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * Create a notification
   */
  private async createNotification(
    type: NotificationType,
    priority: NotificationPriority,
    title: string,
    message: string,
    recipientId?: string,
    relatedEntityType?: string,
    relatedEntityId?: string,
  ): Promise<void> {
    try {
      const notification = new Notification();
      notification.type = type;
      notification.priority = priority;
      notification.title = title;
      notification.message = message;
      notification.status = NotificationStatus.UNREAD;
      notification.recipientId = recipientId ?? null;
      notification.relatedEntityType = relatedEntityType ?? null;
      notification.relatedEntityId = relatedEntityId ?? null;

      await this.notificationRepository.save(notification);
    } catch (error) {
      this.logger.error(
        `Error creating notification: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Get workflow events for an entity
   */
  async getWorkflowEvents(
    entityType: string,
    entityId: string,
  ): Promise<WorkflowEvent[]> {
    return await this.workflowEventRepository.find({
      where: { entityType, entityId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get pending workflow events
   */
  async getPendingWorkflowEvents(): Promise<WorkflowEvent[]> {
    return await this.workflowEventRepository.find({
      where: { status: WorkflowEventStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Retry a failed workflow event
   */
  async retryWorkflowEvent(
    eventId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const event = await this.workflowEventRepository.findOne({
        where: { id: eventId },
      });

      if (!event) {
        return { success: false, message: 'Workflow event not found' };
      }

      if (event.status !== WorkflowEventStatus.FAILED) {
        return { success: false, message: 'Only failed events can be retried' };
      }

      event.status = WorkflowEventStatus.PENDING;
      event.retryCount = (event.retryCount || 0) + 1;
      event.errorMessage = null;
      event.errorStack = null;

      await this.workflowEventRepository.save(event);

      return { success: true, message: 'Event marked for retry' };
    } catch (error) {
      this.logger.error(
        `Error retrying workflow event: ${error.message}`,
        error.stack,
      );
      return { success: false, message: `Error: ${error.message}` };
    }
  }
}
