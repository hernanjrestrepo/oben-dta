import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermission } from './require-permission.decorator';
import { PlatformAuditService } from './platform-audit.service';
import { AuditQueryDto } from './dto/security.dto';

@Controller('platform/audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlatformAuditController {
  constructor(private readonly audit: PlatformAuditService) {}

  @Get()
  @RequirePermission('platform.audit.read')
  query(@Query() dto: AuditQueryDto) {
    return this.audit.query(dto);
  }
}
