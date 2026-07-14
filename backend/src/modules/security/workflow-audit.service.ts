import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WorkflowEvent,
  WorkflowEventStatus,
  WorkflowEventType,
} from '../../entities/workflow-event.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';

export interface LogWorkflowEventParams {
  workflowName: string;
  action: string;
  entityType: string;
  entityId: string;
  eventType?: WorkflowEventType;
  status?: WorkflowEventStatus;
  fromState?: string;
  toState?: string;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  actorId?: string | null;
  reason?: string | null;
}

/**
 * Bitácora de auditoría de negocio (workflow_events), consultable por el
 * propio tenant vía GET /auditoria (permiso auditoria.read). Distinta de
 * `authorization_audit`, que solo registra decisiones de permisos.
 */
@Injectable()
export class WorkflowAuditService {
  constructor(
    @InjectRepository(WorkflowEvent)
    private readonly events: Repository<WorkflowEvent>,
    private readonly ctx: TenantContext,
  ) {}

  async log(params: LogWorkflowEventParams): Promise<WorkflowEvent> {
    const event = this.events.create({
      tenantId: this.ctx.tenantId,
      eventType: params.eventType ?? WorkflowEventType.ACTION_EXECUTED,
      status: params.status ?? WorkflowEventStatus.COMPLETED,
      workflowName: params.workflowName,
      fromState: params.fromState ?? '',
      toState: params.toState ?? '',
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      actorId: params.actorId ?? null,
      inputData: params.inputData ?? null,
      outputData: params.outputData ?? null,
      reason: params.reason ?? null,
      completedAt: new Date(),
    });
    return this.events.save(event);
  }

  async listForTenant(limit = 100): Promise<WorkflowEvent[]> {
    return this.events.find({
      where: { tenantId: this.ctx.tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async listForEntity(
    entityType: string,
    entityId: string,
  ): Promise<WorkflowEvent[]> {
    return this.events.find({
      where: { tenantId: this.ctx.tenantId, entityType, entityId },
      order: { createdAt: 'ASC' },
    });
  }
}
