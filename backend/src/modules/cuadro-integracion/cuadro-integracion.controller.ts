import { Controller, Get, Header, Param, StreamableFile, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { CuadroIntegracionService } from './cuadro-integracion.service';

/** Mismo permiso de consulta que Liquidación: datos de exportación que solo se leen (nada se escribe en Oben). */
export const CUADRO_INTEGRACION_PERMISSION = 'exportations.read';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cuadro-integracion')
export class CuadroIntegracionController {
  constructor(private readonly cuadro: CuadroIntegracionService) {}

  @Get(':orden')
  @RequirePermission(CUADRO_INTEGRACION_PERMISSION)
  obtener(@Param('orden') orden: string) {
    return this.cuadro.obtener(orden);
  }

  @Get(':orden/excel')
  @RequirePermission(CUADRO_INTEGRACION_PERMISSION)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async excel(@Param('orden') orden: string) {
    return new StreamableFile(await this.cuadro.excel(orden), {
      disposition: `attachment; filename="cuadro-integracion-${orden.replace(/[^\w-]/g, '')}.xlsx"`,
    });
  }
}
