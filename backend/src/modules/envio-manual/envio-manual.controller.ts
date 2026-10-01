import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { EnviarListaDto } from '../distribution-lists/dto/distribution-list.dto';
import { EnvioManualService } from './envio-manual.service';

/**
 * "Enviar ahora" de una lista (WO-026). El permiso de la ruta es el mínimo
 * (`dashboard.view`); quién puede disparar lo decide el servicio: solo
 * administración (`configuracion.update`) o un dueño de ESA lista.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('distribution-lists')
export class EnvioManualController {
  constructor(private readonly envios: EnvioManualService) {}

  @Post(':id/enviar')
  @RequirePermission('dashboard.view')
  enviar(@Param('id') id: string, @Body() dto: EnviarListaDto) {
    return this.envios.enviar(id, dto.clave, dto.ov);
  }
}
