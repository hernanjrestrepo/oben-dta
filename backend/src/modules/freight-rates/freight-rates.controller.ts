import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IsOptional, IsString } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';
import { FreightTransloadRate } from '../../entities/freight-transload-rate.entity';
import { FreightDestinationSurcharge } from '../../entities/freight-destination-surcharge.entity';
import { TarifarioExportacionService } from './tarifario-exportacion.service';

/** El Excel del tarifario de exportación pesa ~1 MB; 15 MB de margen. */
export const MAX_BYTES_TARIFARIO = 15 * 1024 * 1024;

class CargaTarifarioDto {
  /** "true" = aplicar; cualquier otra cosa = solo vista previa (multipart: llega como texto). */
  @IsOptional()
  @IsString()
  confirmar?: string;
}

/**
 * Maestro de tarifas de flete. Lectura con `quotes.read`. El tarifario de exportación de COMEX (patas 2 y 3)
 * se sube desde la pantalla de Liquidación (reunión del 20-oct): vista previa, luego confirmar; solo COMEX
 * (`exportations.approve`), y cada carga queda en el histórico con el archivo original.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('freight-rates')
export class FreightRatesController {
  constructor(
    @InjectRepository(FreightInlandRate)
    private readonly inland: Repository<FreightInlandRate>,
    @InjectRepository(FreightTransloadRate)
    private readonly transload: Repository<FreightTransloadRate>,
    @InjectRepository(FreightDestinationSurcharge)
    private readonly surcharges: Repository<FreightDestinationSurcharge>,
    private readonly ctx: TenantContext,
    private readonly tarifario: TarifarioExportacionService,
  ) {}

  /** Sube el tarifario de exportación (Excel de COMEX). Sin `confirmar=true` solo muestra lo que cambiaría. */
  @Post('tarifario-exportacion')
  @RequirePermission('exportations.approve')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_BYTES_TARIFARIO } }))
  async cargarTarifario(
    @UploadedFile() archivo: { originalname: string; size: number; buffer: Buffer } | undefined,
    @Body() dto: CargaTarifarioDto,
    @Req() req: { user?: { email?: string; firstName?: string; lastName?: string } },
  ) {
    if (!archivo?.buffer?.length) throw new BadRequestException('Adjunta el Excel del tarifario (campo "archivo").');
    if (!/\.xlsx?$/i.test(archivo.originalname ?? '')) throw new BadRequestException('El tarifario debe ser un archivo de Excel (.xlsx).');
    const u = req.user ?? {};
    const usuario = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || null;
    return this.tarifario.cargar(archivo.buffer, archivo.originalname, { confirmar: dto.confirmar === 'true', usuario });
  }

  /** Histórico de cuadros de tarifas subidos (quién, cuándo, cuántas tarifas). */
  @Get('tarifario-exportacion/cargas')
  @RequirePermission('exportations.read')
  historialTarifario() {
    return this.tarifario.historial();
  }

  /** Descarga el Excel original de una carga del histórico. */
  @Get('tarifario-exportacion/cargas/:id/archivo')
  @RequirePermission('exportations.read')
  async archivoTarifario(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const a = await this.tarifario.archivoDeCarga(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.archivo)}`);
    res.send(a.contenido);
  }

  @Get('inland')
  @RequirePermission('quotes.read')
  async getInland(@Query('country') country?: string) {
    return this.inland.find({
      where: { tenantId: this.ctx.tenantId, ...(country ? { country: country as 'USA' | 'CA' } : {}) },
      order: { state: 'ASC', destinationPort: 'ASC' },
    });
  }

  @Get('transload')
  @RequirePermission('quotes.read')
  async getTransload() {
    return this.transload.find({
      where: { tenantId: this.ctx.tenantId },
      order: { destinationPort: 'ASC' },
    });
  }

  @Get('destination-surcharges')
  @RequirePermission('quotes.read')
  async getSurcharges(@Query('country') country?: string) {
    return this.surcharges.find({
      where: { tenantId: this.ctx.tenantId, ...(country ? { country: country as never } : {}) },
      order: { country: 'ASC' },
    });
  }
}
