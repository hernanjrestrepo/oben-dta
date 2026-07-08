import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermission } from './require-permission.decorator';
import { PlatformSystemStatusService } from './platform-system-status.service';

@Controller('platform/system-status')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlatformSystemController {
  constructor(private readonly status: PlatformSystemStatusService) {}

  @Get()
  @RequirePermission('platform.system.read')
  get() {
    return this.status.get();
  }
}
