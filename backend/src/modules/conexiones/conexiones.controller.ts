import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { SharepointDiagnosticoService } from './sharepoint-diagnostico.service';

/**
 * Conexión de Oben Xmart con Microsoft 365: con qué app entra, a qué buzón y si puede leer el cuadro de
 * facturación en SharePoint. Todo es solo lectura (`integrations.read`); nunca devuelve secretos ni tokens.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('conexiones/microsoft')
export class ConexionesController {
  constructor(private readonly sharepoint: SharepointDiagnosticoService) {}

  @Get()
  @RequirePermission('integrations.read')
  configuracion() {
    return this.sharepoint.configuracion();
  }

  /** Prueba en vivo contra Microsoft (token nuevo + caminos al archivo). Queda en la auditoría. */
  @Post('probar-sharepoint')
  @RequirePermission('integrations.read')
  probar() {
    return this.sharepoint.probar();
  }
}
