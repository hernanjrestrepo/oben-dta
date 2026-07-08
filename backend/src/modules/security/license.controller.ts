import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LicensingService } from './licensing.service';

/**
 * Endpoint de solo lectura para que el FRONTEND del tenant sepa si debe
 * mostrar la pantalla de bloqueo por licencia vencida. No requiere permisos
 * de plataforma — cualquier usuario autenticado de su propio tenant puede
 * consultarlo (es información operativa, no administrativa).
 */
@Controller('license')
@UseGuards(JwtAuthGuard)
export class LicenseController {
  constructor(private readonly licensing: LicensingService) {}

  @Get('status')
  async status(@Req() req: { user: { tenantId: string | null } }) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException(
        'Este endpoint es exclusivo de usuarios de tenant',
      );
    }
    const result = await this.licensing.validate(req.user.tenantId);
    return {
      valid: result.valid,
      reason: result.reason ?? null,
      graceActive: result.graceActive ?? false,
      daysRemaining: result.daysRemaining ?? null,
      renewalDue: result.renewalDue ?? false,
      expiresAt: result.license?.expiresAt ?? null,
      planKey: result.license?.planKey ?? null,
    };
  }
}
