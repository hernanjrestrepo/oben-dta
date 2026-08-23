import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { WorkflowEvent } from '../../entities/workflow-event.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';

interface EngineOutputData {
  status?: string;
  totalDurationMs?: number;
  documentsTrace?: Array<{ source: string; durationMs: number }>;
  validationsTrace?: Array<{ type: string; passed: boolean; durationMs: number }>;
  actionsTrace?: Array<{ type: string; status: string; durationMs: number }>;
}

export interface SlowestEntry {
  type: string;
  durationMs: number;
}

export interface DocumentFlowMetrics {
  windowHours: number;
  flowsExecuted: number;
  flowsSuccessful: number;
  flowsFailed: number;
  flowsPerHour: Array<{ hour: string; count: number }>;
  avgDurationMs: number;
  maxDurationMs: number;
  slowestAction: SlowestEntry | null;
  slowestAdapter: SlowestEntry | null;
  validationWithMostFailures: { type: string; failureCount: number } | null;
}

/**
 * Agrega métricas globales del motor a partir de `workflow_events`
 * (`workflowName='document_flow'`) — no es instrumentación nueva, es lectura
 * de las trazas que el motor ya escribe por cada ejecución de regla (ver
 * ADR-DocumentFlowEngine.md § Observabilidad). Pensado para que el Dashboard
 * lo consuma directamente.
 */
@Injectable()
export class DocumentFlowMetricsService {
  constructor(
    @InjectRepository(WorkflowEvent)
    private readonly events: Repository<WorkflowEvent>,
    private readonly ctx: TenantContext,
  ) {}

  async getMetrics(windowHours = 24): Promise<DocumentFlowMetrics> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const rows = await this.events.find({
      where: {
        tenantId: this.ctx.tenantId,
        workflowName: 'document_flow',
        createdAt: MoreThanOrEqual(since),
      },
      order: { createdAt: 'ASC' },
    });

    const durations: number[] = [];
    const perHour = new Map<string, number>();
    let successful = 0;
    let failed = 0;
    const actionDurations = new Map<string, number[]>();
    const sourceDurations = new Map<string, number[]>();
    const validationFailures = new Map<string, number>();

    for (const row of rows) {
      const data = (row.outputData ?? {}) as EngineOutputData;
      if (typeof data.totalDurationMs === 'number') durations.push(data.totalDurationMs);

      const hourKey = new Date(row.createdAt).toISOString().slice(0, 13); // YYYY-MM-DDTHH
      perHour.set(hourKey, (perHour.get(hourKey) ?? 0) + 1);

      if (data.status === 'completed' || data.status === 'skipped') successful++;
      else failed++; // partial | validation_failed

      for (const a of data.actionsTrace ?? []) {
        const list = actionDurations.get(a.type) ?? [];
        list.push(a.durationMs);
        actionDurations.set(a.type, list);
      }
      for (const d of data.documentsTrace ?? []) {
        const list = sourceDurations.get(d.source) ?? [];
        list.push(d.durationMs);
        sourceDurations.set(d.source, list);
      }
      for (const v of data.validationsTrace ?? []) {
        if (!v.passed) validationFailures.set(v.type, (validationFailures.get(v.type) ?? 0) + 1);
      }
    }

    const avgOf = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const maxOf = (arr: number[]) => (arr.length ? Math.max(...arr) : 0);

    let slowestAction: SlowestEntry | null = null;
    for (const [type, list] of actionDurations.entries()) {
      const avg = avgOf(list);
      if (!slowestAction || avg > slowestAction.durationMs) slowestAction = { type, durationMs: Math.round(avg) };
    }
    let slowestAdapter: SlowestEntry | null = null;
    for (const [type, list] of sourceDurations.entries()) {
      const avg = avgOf(list);
      if (!slowestAdapter || avg > slowestAdapter.durationMs) slowestAdapter = { type, durationMs: Math.round(avg) };
    }
    let validationWithMostFailures: { type: string; failureCount: number } | null = null;
    for (const [type, count] of validationFailures.entries()) {
      if (!validationWithMostFailures || count > validationWithMostFailures.failureCount) {
        validationWithMostFailures = { type, failureCount: count };
      }
    }

    return {
      windowHours,
      flowsExecuted: rows.length,
      flowsSuccessful: successful,
      flowsFailed: failed,
      flowsPerHour: Array.from(perHour.entries()).map(([hour, count]) => ({ hour, count })),
      avgDurationMs: Math.round(avgOf(durations)),
      maxDurationMs: Math.round(maxOf(durations)),
      slowestAction,
      slowestAdapter,
      validationWithMostFailures,
    };
  }
}
