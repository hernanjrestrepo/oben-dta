import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { ComercialService } from './comercial.service';

/**
 * Seguimiento Comercial de Proformas (Customer Service). Todas las rutas son
 * de solo lectura y exigen `orders.read`: una Proforma es la antesala de la
 * orden de venta, y `orders` está en todos los planes — no hace falta un
 * módulo nuevo en el catálogo. Hoy la fuente (`obenPlus`) es SIMULADA y cada
 * respuesta lo declara (`simulated`, `fuentes`).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comercial')
export class ComercialController {
  constructor(private readonly comercial: ComercialService) {}

  /** Tablero agregado: Proformas pendientes/activas, por estado, por cliente, retenidas y próximas entregas. */
  @Get('dashboard')
  @RequirePermission('orders.read')
  dashboard() {
    return this.comercial.dashboard();
  }

  /** Proformas en seguimiento, filtrables por cliente (nombre en Oben) y estado. */
  @Get('proformas')
  @RequirePermission('orders.read')
  list(@Query('cliente') cliente?: string, @Query('estado') estado?: string) {
    return this.comercial.listProformas({ cliente, estado });
  }

  /** Seguimiento completo de una Proforma: estado, fechas, cartera, cubicaje, siguiente paso y alertas. */
  @Get('proformas/:numberPF')
  @RequirePermission('orders.read')
  proforma(@Param('numberPF') numberPF: string) {
    return this.comercial.getProforma(numberPF);
  }
}
