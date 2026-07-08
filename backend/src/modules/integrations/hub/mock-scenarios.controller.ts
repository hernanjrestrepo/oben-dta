import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../security/permissions.guard';
import { RequirePermission } from '../../security/require-permission.decorator';
import { MockScenariosService } from './mock-scenarios.service';
import { IntegrationSystem } from './adapter.types';
import { UpsertScenarioBodyDto } from './dto/scenario.dto';

/**
 * Panel de escenarios mock por tenant. Solo modo mock lo consulta.
 * Ruta: /integrations/scenarios/*
 *
 * Permisos:
 *   - Lectura → integrations.read
 *   - Escritura → integrations.update
 *   - Reset masivo → integrations.delete
 */
@Controller('integrations/scenarios')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MockScenariosController {
  constructor(private readonly service: MockScenariosService) {}

  @Get('behaviors')
  @RequirePermission('integrations.read')
  behaviors() {
    return { behaviors: this.service.behaviors() };
  }

  @Get()
  @RequirePermission('integrations.read')
  list() {
    return this.service.list();
  }

  @Get(':system')
  @RequirePermission('integrations.read')
  listBySystem(@Param('system') system: string) {
    return this.service.listBySystem(system as IntegrationSystem);
  }

  @Get(':system/:operation')
  @RequirePermission('integrations.read')
  async get(@Param('system') system: string, @Param('operation') operation: string) {
    return (await this.service.get(system as IntegrationSystem, operation)) ?? {
      system, operation, behavior: 'happy_path', enabled: true,
    };
  }

  @Post()
  @RequirePermission('integrations.update')
  upsert(
    @Body() dto: UpsertScenarioBodyDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.service.upsert(
      { ...(dto as unknown as Parameters<MockScenariosService['upsert']>[0]) },
      req.user.sub,
    );
  }

  @Put()
  @RequirePermission('integrations.update')
  put(@Body() dto: UpsertScenarioBodyDto, @Req() req: { user: { sub: string } }) {
    return this.service.upsert(
      { ...(dto as unknown as Parameters<MockScenariosService['upsert']>[0]) },
      req.user.sub,
    );
  }

  @Delete(':system/:operation')
  @RequirePermission('integrations.update')
  async remove(@Param('system') system: string, @Param('operation') operation: string) {
    await this.service.remove(system as IntegrationSystem, operation);
    return { deleted: true };
  }

  @Delete()
  @RequirePermission('integrations.delete')
  resetAll() {
    return this.service.resetAll();
  }
}
