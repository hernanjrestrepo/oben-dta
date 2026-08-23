import { DocumentFlowMetricsService } from './document-flow-metrics.service';

function row(outputData: Record<string, unknown>, createdAt: Date) {
  return { tenantId: 't1', workflowName: 'document_flow', createdAt, outputData };
}

describe('DocumentFlowMetricsService', () => {
  it('agrega flowsExecuted/Successful/Failed, duración y "más lento" a partir de workflow_events', async () => {
    const now = new Date();
    const rows = [
      row({ status: 'completed', totalDurationMs: 100, actionsTrace: [{ type: 'send_email', durationMs: 20 }], documentsTrace: [{ source: 'generated', durationMs: 80 }], validationsTrace: [] }, now),
      row({ status: 'completed', totalDurationMs: 200, actionsTrace: [{ type: 'create_order', durationMs: 150 }], documentsTrace: [], validationsTrace: [{ type: 'credit_limit', passed: true, durationMs: 5 }] }, now),
      row({ status: 'validation_failed', totalDurationMs: 10, actionsTrace: [], documentsTrace: [], validationsTrace: [{ type: 'credit_limit', passed: false, durationMs: 5 }, { type: 'quote_exists', passed: false, durationMs: 3 }] }, now),
    ];
    const events = {
      find: jest.fn().mockResolvedValue(rows),
    };
    const ctx = { tenantId: 't1' };
    const service = new DocumentFlowMetricsService(events as never, ctx as never);

    const metrics = await service.getMetrics(24);

    expect(metrics.flowsExecuted).toBe(3);
    expect(metrics.flowsSuccessful).toBe(2);
    expect(metrics.flowsFailed).toBe(1);
    expect(metrics.avgDurationMs).toBe(Math.round((100 + 200 + 10) / 3));
    expect(metrics.maxDurationMs).toBe(200);
    expect(metrics.slowestAction).toMatchObject({ type: 'create_order' });
    expect(metrics.slowestAdapter).toMatchObject({ type: 'generated' });
    expect(metrics.validationWithMostFailures).toMatchObject({ type: 'credit_limit', failureCount: 1 });
  });

  it('sin eventos en la ventana → métricas en cero, no revienta', async () => {
    const events = { find: jest.fn().mockResolvedValue([]) };
    const service = new DocumentFlowMetricsService(events as never, { tenantId: 't1' } as never);
    const metrics = await service.getMetrics(1);
    expect(metrics.flowsExecuted).toBe(0);
    expect(metrics.slowestAction).toBeNull();
    expect(metrics.validationWithMostFailures).toBeNull();
  });
});
