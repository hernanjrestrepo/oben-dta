import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../security/permissions.guard';
import { RequirePermission } from '../../security/require-permission.decorator';
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { IntegrationHubService } from './integration-hub.service';
import { INTEGRATION_SYSTEMS, IntegrationSystem } from './adapter.types';

class ExecuteDto {
  @IsString() @MinLength(2)
  system: string;

  @IsString() @MinLength(2)
  operation: string;

  @IsOptional() @IsObject()
  args?: Record<string, unknown>;
}

/**
 * Puerta única del hub. Rutas:
 *   GET  /integrations/status                     → estado por sistema (mode/state/latencia)
 *   GET  /integrations/:system/capabilities       → operaciones soportadas
 *   POST /integrations/execute                    → invocar cualquier operación
 *
 * Compatibilidad: el legacy IntegrationsController (VETA/NetSuite específico)
 * queda deprecado; los tests del bloque 9 verificarán que ningún consumidor
 * interno lo use. Frontend se migra en Bloque 10.
 */
@Controller('integrations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IntegrationHubController {
  constructor(private readonly hub: IntegrationHubService) {}

  @Get('status')
  @RequirePermission('integrations.read')
  status() {
    return this.hub.status();
  }

  @Get(':system/capabilities')
  @RequirePermission('integrations.read')
  capabilities(@Param('system') system: string) {
    this.assertSystem(system);
    return this.hub.capabilities(system as IntegrationSystem);
  }

  @Post('execute')
  @RequirePermission('integrations.read')
  execute(@Body() dto: ExecuteDto) {
    this.assertSystem(dto?.system);
    if (!dto.operation) {
      throw new BadRequestException('operation requerida');
    }
    return this.hub.call(dto.system as IntegrationSystem, dto.operation, dto.args ?? {});
  }

  private assertSystem(system: string | undefined): void {
    if (!system || !INTEGRATION_SYSTEMS.includes(system as IntegrationSystem)) {
      throw new BadRequestException(
        `system inválido. Válidos: ${INTEGRATION_SYSTEMS.join(', ')}`,
      );
    }
  }
}
