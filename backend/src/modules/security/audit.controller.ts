import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermission } from './require-permission.decorator';
import { WorkflowAuditService } from './workflow-audit.service';

/**
 * Auditoría de negocio DENTRO del tenant (distinta de /platform/audit, que es
 * de plataforma). Expone la bitácora workflow_events filtrada por tenant.
 */
@Controller('auditoria')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly audit: WorkflowAuditService) {}

  @Get()
  @RequirePermission('auditoria.read')
  list(@Query('limit') limit?: string) {
    return this.audit.listForTenant(limit ? +limit : 100);
  }

  @Get(':entityType/:entityId')
  @RequirePermission('auditoria.read')
  listForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.audit.listForEntity(entityType, entityId);
  }
}
