import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowEvent } from '../entities/workflow-event.entity';
import { ProductionOrder } from '../entities/production-order.entity';
import { Order } from '../entities/order.entity';
import { CreditValidation } from '../entities/credit-validation.entity';
import { PackingList } from '../entities/packing-list.entity';
import { Shipment } from '../entities/shipment.entity';
import { Notification } from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { WorkflowEngineService } from '../services/workflow-engine.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowEvent,
      ProductionOrder,
      Order,
      CreditValidation,
      PackingList,
      Shipment,
      Notification,
      User,
    ]),
  ],
  providers: [WorkflowEngineService],
  exports: [WorkflowEngineService],
})
export class WorkflowModule {}
