import { Controller, Post, UseGuards } from '@nestjs/common';
import { DemoService } from './demo.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('run')
  @RequirePermission('automations.execute')
  async run() {
    return this.demo.runFullDemo();
  }
}
