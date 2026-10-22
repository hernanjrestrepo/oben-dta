import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { ProformasObenService } from './proformas-oben.service';

class LineaDto {
  @IsOptional() @IsInt() @IsPositive() codSecProduct?: number;
  @IsOptional() @IsString() @MaxLength(60) referencia?: string;
  @IsNumber() @IsPositive() kilos: number;
  @IsNumber() @IsPositive() precio: number;
  @IsOptional() @IsString() @MaxLength(200) etiqueta?: string;
  @IsOptional() @IsString() @MaxLength(100) numeroParte?: string;
  @IsOptional() @IsInt() @IsPositive() codSecTariff?: number;
}

class ProformaDto {
  @IsInt() @IsPositive() cliente: number;
  @IsInt() @IsPositive() direccion: number;
  @IsString() @MaxLength(100) ordenCompra: string;
  @IsString() fechaEntrega: string;
  @IsString() fechaDespacho: string;
  @IsOptional() @IsString() mesFactura?: string;
  @IsOptional() @IsString() fechaSolicitudCliente?: string;
  @IsOptional() @IsString() @MaxLength(100) contenedor?: string;
  @IsOptional() @IsNumber() pesoBruto?: number;
  @IsOptional() @IsString() @MaxLength(500) notas?: string;
  @IsOptional() @IsString() @MaxLength(500) notaProforma?: string;
  @IsOptional() @IsString() @MaxLength(500) notaConsignado?: string;
  @IsOptional() @IsString() @MaxLength(500) notaNotificado?: string;
  @IsOptional() @IsString() @MaxLength(1000) notaOperativa?: string;
  @IsOptional() @IsString() @MaxLength(1000) notaEspecial?: string;
  @IsOptional() @IsNumber() iva?: number;
  @IsOptional() @IsNumber() reteFuente?: number;
  @IsOptional() @IsNumber() reteIva?: number;
  @IsOptional() @IsInt() documentos?: number;
  @IsOptional() @IsBoolean() muestra?: boolean;
  @IsOptional() @IsInt() tipoEnvioMuestra?: number;
  @IsOptional() @IsBoolean() stock?: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => LineaDto) lineas: LineaDto[];
}

class ReintentarDto {
  /** true = ya se verificó en OBEN MAS que el paso sin respuesta NO quedó hecho. */
  @IsOptional() @IsBoolean() verificado?: boolean;
}

type Req0 = { user?: { email?: string; firstName?: string; lastName?: string } };
const nombre = (req: Req0) => {
  const u = req.user ?? {};
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || null;
};

/** Proformas en OBEN MAS con las APIs comerciales (hoy en el servidor de pruebas de Oben). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comercial/proformas-oben')
export class ProformasObenController {
  constructor(private readonly proformas: ProformasObenService) {}

  @Get()
  @RequirePermission('orders.read')
  listar() {
    return this.proformas.listar();
  }

  @Get(':id')
  @RequirePermission('orders.read')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.proformas.obtener(id);
  }

  /** Arma la proforma con los maestros de Oben y valida el empaque. No escribe nada. */
  @Post('vista-previa')
  @RequirePermission('orders.read')
  vistaPrevia(@Body() dto: ProformaDto) {
    return this.proformas.previsualizar(dto);
  }

  /** Crea encabezado y detalle en OBEN MAS. */
  @Post()
  @RequirePermission('orders.create')
  crear(@Body() dto: ProformaDto, @Req() req: Req0) {
    return this.proformas.crear(dto, nombre(req));
  }

  @Post(':id/reintentar')
  @RequirePermission('orders.create')
  reintentar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReintentarDto, @Req() req: Req0) {
    return this.proformas.reintentar(id, nombre(req), !!dto.verificado);
  }

  @Post(':id/orden-venta')
  @RequirePermission('orders.update')
  crearOV(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req0) {
    return this.proformas.crearOV(id, nombre(req));
  }

  @Post(':id/activar')
  @RequirePermission('orders.update')
  activar(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req0) {
    return this.proformas.activar(id, nombre(req));
  }
}
