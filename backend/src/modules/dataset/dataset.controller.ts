import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { DatasetGeneratorService } from './dataset-generator.service';
import { GenerateDatasetDto } from './dto/generate-dataset.dto';

/**
 * Endpoint de administración de plataforma para generar datasets sintéticos
 * de QA/demo/entrenamiento por tenant. Gateado por permiso de PLATAFORMA
 * (no de tenant) porque generar 20.000 órdenes es una acción operativa de
 * capacidad que puede afectar un servidor pequeño — no es autoservicio de
 * cualquier usuario del tenant. El camino principal para volumen alto sigue
 * siendo el CLI (`npm run dataset:generate`), corrido por un operador
 * directamente en el servidor.
 */
@Controller('platform/dataset')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DatasetController {
  constructor(private readonly generator: DatasetGeneratorService) {}

  @Post('generate')
  @RequirePermission('platform.tenants.manage')
  generate(@Body() dto: GenerateDatasetDto) {
    return this.generator.generate(dto);
  }
}
