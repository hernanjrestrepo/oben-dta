import { Body, Controller, Get, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, Matches } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { FacturasParcialesService, fechaHoraBogota, type OrdenProgramada } from './facturas-parciales.service';

class ProgramarDiaDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe venir como AAAA-MM-DD' })
  fecha!: string;

  /** Cada orden: { ov, pf, tipo?: 'completa' | 'parcial', estadoOben?, cliente? } — el servicio valida cada una. */
  @IsArray()
  ordenes!: OrdenProgramada[];
}

/**
 * Programación diaria de facturación (WO-032): el cuadro de Oben de lo que se factura cada día. Ver exige
 * `invoices.read`; cargar el cuadro y facturar lo programado exigen `invoices.create` (crea facturas reales en Oben).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('facturacion-programada')
export class FacturacionProgramadaController {
  private readonly logger = new Logger(FacturacionProgramadaController.name);

  constructor(private readonly facturas: FacturasParcialesService) {}

  @Get()
  @RequirePermission('invoices.read')
  listar(@Query('fecha') fecha?: string) {
    return this.facturas.programacionDelDia(fecha || undefined);
  }

  /**
   * Reemplaza la programación del día. Si es la de hoy, lo que ya se puede facturar se factura en segundo plano
   * (cada factura tarda hasta minuto y medio en Oben): el resultado llega por correo a la lista de Facturación y
   * queda en la pantalla de Facturas.
   */
  @Post()
  @RequirePermission('invoices.create')
  async programar(@Body() dto: ProgramarDiaDto) {
    const ordenes = await this.facturas.programarDia(dto.fecha, dto.ordenes);
    const esHoy = dto.fecha === fechaHoraBogota(new Date()).fecha;
    if (esHoy) {
      void this.facturas.facturarProgramadasDeHoy().catch((err) => this.logger.error(`Programación ${dto.fecha}: falló el proceso de facturación: ${(err as Error).message}`));
    }
    return { fecha: dto.fecha, ordenes, facturando: esHoy };
  }

  /** Vuelve a pasar por la programación de hoy y factura lo que ya se pueda (no repite lo ya pedido). */
  @Post('facturar')
  @RequirePermission('invoices.create')
  facturar() {
    return this.facturas.facturarProgramadasDeHoy();
  }
}
