import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';
import { FreightTransloadRate } from '../../entities/freight-transload-rate.entity';
import { FreightDestinationSurcharge } from '../../entities/freight-destination-surcharge.entity';
import { TarifarioExportacionService, validarVigencia } from './tarifario-exportacion.service';
import { LiquidacionRatesService, MARCA_MANUAL } from './liquidacion-rates.service';

/** El Excel del tarifario de exportación pesa ~1 MB; 15 MB de margen. */
export const MAX_BYTES_TARIFARIO = 15 * 1024 * 1024;

class CargaTarifarioDto {
  /** "true" = aplicar; cualquier otra cosa = solo vista previa (multipart: llega como texto). */
  @IsOptional()
  @IsString()
  confirmar?: string;

  /** Vigencia del cuadro (AAAA-MM-DD): obligatoria para aplicar; reemplaza las fechas del Excel. */
  @IsOptional()
  @IsString()
  vigenteDesde?: string;

  @IsOptional()
  @IsString()
  vigenteHasta?: string;
}

/** Tarifa que no está en el cuadro, agregada a mano con el botón + (Hernán, 23-oct). */
class TarifaManualDto {
  @IsIn(['maritima', 'inland'])
  tipo!: 'maritima' | 'inland';

  /** Marítima: puerto de embarque (Colombia). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  origen?: string;

  /** Marítima: puerto de destino. Inland: puerto o rampa de donde sale el camión. */
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  destino!: string;

  /** Inland: dirección de entrega (con el ZIP de 5 dígitos, así la encuentra la liquidación). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  agente!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  naviera?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  dias?: number;

  /** USD por contenedor de 40'. */
  @IsNumber()
  @IsPositive()
  valor!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  comisionAduanera?: number;

  @IsString()
  vigenteDesde!: string;

  @IsString()
  vigenteHasta!: string;
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
    private readonly rates: LiquidacionRatesService,
  ) {}

  /** Tarifas agregadas a mano y los destinos que ya existen en el tarifario (para escoger sin digitar mal). */
  @Get('tarifas-manuales')
  @RequirePermission('exportations.read')
  tarifasManuales() {
    return this.rates.tarifasManuales(this.ctx.tenantId);
  }

  /** Agrega una tarifa que no está en el cuadro: queda como opción en las liquidaciones con ese destino. */
  @Post('tarifas-manuales')
  @RequirePermission('exportations.approve')
  async agregarTarifaManual(@Body() dto: TarifaManualDto, @Req() req: { user?: { email?: string; firstName?: string; lastName?: string } }) {
    const vigencia = validarVigencia(dto.vigenteDesde, dto.vigenteHasta, true)!;
    const u = req.user ?? {};
    const usuario = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || 'sin usuario';
    const marca = `${MARCA_MANUAL} · ${usuario} · ${new Date().toISOString().slice(0, 10)}`;
    const t = (v?: string) => v?.trim() || null;
    if (dto.tipo === 'maritima') {
      if (!t(dto.origen)) throw new BadRequestException('Indica el puerto de origen.');
      await this.rates.agregarTarifaManual(
        this.ctx.tenantId,
        { tipo: 'maritima', origen: dto.origen!.trim(), destino: dto.destino.trim(), agente: dto.agente.trim(), naviera: t(dto.naviera), dias: dto.dias ?? null, valor: dto.valor },
        marca,
        vigencia,
      );
    } else {
      if (!/\d{5}/.test(dto.direccion ?? '')) throw new BadRequestException('La dirección de entrega debe traer el ZIP de 5 dígitos (así la encuentra la liquidación).');
      await this.rates.agregarTarifaManual(
        this.ctx.tenantId,
        { tipo: 'inland', puerto: dto.destino.trim(), direccion: dto.direccion!.trim(), agente: dto.agente.trim(), valor: dto.valor, comisionAduanera: dto.comisionAduanera ?? null, dias: dto.dias ?? null },
        marca,
        vigencia,
      );
    }
    return this.rates.tarifasManuales(this.ctx.tenantId);
  }

  /** Quita una tarifa agregada a mano (las del archivo de fletes no se pueden quitar por aquí). */
  @Delete('tarifas-manuales/:tipo/:id')
  @RequirePermission('exportations.approve')
  async quitarTarifaManual(@Param('tipo') tipo: string, @Param('id', ParseUUIDPipe) id: string) {
    if (tipo !== 'maritima' && tipo !== 'inland') throw new BadRequestException('Tipo de tarifa inválido.');
    if (!(await this.rates.quitarTarifaManual(this.ctx.tenantId, tipo, id))) throw new BadRequestException('Esa tarifa no existe o no fue agregada a mano.');
    return this.rates.tarifasManuales(this.ctx.tenantId);
  }

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
    return this.tarifario.cargar(archivo.buffer, archivo.originalname, { confirmar: dto.confirmar === 'true', usuario, vigenteDesde: dto.vigenteDesde, vigenteHasta: dto.vigenteHasta });
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
