import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { DocumentFlowMetricsService } from './document-flow-metrics.service';

/**
 * Métricas globales del motor para consumo del Dashboard (WO-018 Sprint 2).
 * Agrega `workflow_events` — no requiere ninguna instrumentación adicional,
 * la traza ya existe desde WO-016/WO-017.
 */
@Controller('document-flow/metrics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentFlowMetricsController {
  constructor(private readonly metrics: DocumentFlowMetricsService) {}

  @Get()
  @RequirePermission('dashboard.view')
  getMetrics(@Query('windowHours') windowHours?: string) {
    const hours = windowHours ? Number(windowHours) : 24;
    return this.metrics.getMetrics(Number.isFinite(hours) && hours > 0 ? hours : 24);
  }
}
