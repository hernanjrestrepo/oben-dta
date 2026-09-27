import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { ComercialFlujoService } from './comercial-flujo.service';
import { ComercialSimuladorService, type ControlSimulador } from './comercial-simulador.service';
import { construirLinea } from './oc-extractor';

class AdjuntoDto {
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsString()
  @MaxLength(15_000_000)
  contentBase64!: string;
}

export class OcManualDto {
  /** Remitente (compras del cliente): define de qué cliente es la orden. */
  @IsEmail()
  from!: string;

  @IsString()
  @MaxLength(500)
  subject!: string;

  @IsString()
  @MaxLength(100_000)
  body!: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AdjuntoDto)
  attachments?: AdjuntoDto[];
}

class EditarLineaDto {
  @IsInt()
  @Min(1)
  n!: number;

  @IsOptional()
  @IsString()
  codigoOben?: string;

  @IsOptional()
  @IsBoolean()
  guardarEquivalencia?: boolean;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  kilos?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  anchoMm?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  espesorMicras?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  precioUnitario?: number;

  @IsOptional()
  @IsIn(['USD', 'COP'])
  moneda?: string;
}

class DireccionManualDto {
  @IsString()
  @IsNotEmpty()
  direccion!: string;

  @IsOptional()
  @IsString()
  ciudad?: string;

  @IsString()
  @IsNotEmpty()
  pais!: string;
}

export class EditarCasoDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditarLineaDto)
  lineas?: EditarLineaDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  quitarLineas?: number[];

  @IsOptional()
  @IsString()
  direccionId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DireccionManualDto)
  direccionManual?: DireccionManualDto;

  @IsOptional()
  @IsString()
  fechaRequerida?: string;

  @IsOptional()
  @IsString()
  clienteFinal?: string;

  @IsOptional()
  @IsString()
  ocNumero?: string;
}

class ConfirmarDto {
  /** Obligatorio: la confirmación es explícita (freno de mano). */
  @IsBoolean()
  confirm!: boolean;

  /** Tras un timeout: la persona ya verificó en OBEN MAS qué quedó hecho. */
  @IsOptional()
  @IsBoolean()
  verificadoEnObenMas?: boolean;
}

class LineaRespuestaDto {
  @IsString()
  @IsNotEmpty()
  codigoCliente!: string;

  @IsNumber()
  @IsPositive()
  kilos!: number;

  @IsNumber()
  @IsPositive()
  anchoMm!: number;

  @IsOptional()
  @IsString()
  codigoOben?: string;
}

export class RespuestaManualDto {
  @IsIn(['aprueba', 'rechaza', 'modifica'])
  tipo!: 'aprueba' | 'rechaza' | 'modifica';

  /** Cómo llegó y qué dijo el cliente (queda en la bitácora del caso). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  nota!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineaRespuestaDto)
  lineas?: LineaRespuestaDto[];
}

class MotivoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo!: string;
}

export class ConfigDto {
  @IsOptional()
  @IsBoolean()
  habilitado?: boolean;

  @IsOptional()
  @IsIn(['supervisado', 'automatico'])
  modo?: string;

  @IsOptional()
  @IsObject()
  seguimientoFirma?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  seguimientoCartera?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  extractor?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @Type(() => Object)
  ejemplosOc?: Record<string, unknown>[];
}

class ControlSimDto {
  @IsOptional()
  @IsString()
  fecha?: string;
}

/**
 * Flujo Comercial de punta a punta (reunión 2026-09-23): casos, freno de
 * mano, respuestas del cliente, tablero, configuración y simulador.
 * Lectura: `orders.read`; acciones: `orders.update` (crear una OC a mano:
 * `orders.create`); configuración: `configuracion.read`/`configuracion.update`.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comercial')
export class ComercialCasosController {
  constructor(
    private readonly flujo: ComercialFlujoService,
    private readonly simulador: ComercialSimuladorService,
  ) {}

  /** Tablero por etapa, filtrable por rango de fechas (YYYY-MM-DD) y cliente. */
  @Get('casos/tablero')
  @RequirePermission('orders.read')
  tablero(@Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('cliente') cliente?: string) {
    return this.flujo.tablero({ desde, hasta, cliente });
  }

  @Get('casos')
  @RequirePermission('orders.read')
  listar(@Query('estado') estado?: string, @Query('cliente') cliente?: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.flujo.listar({ estado, cliente, desde, hasta });
  }

  @Get('casos/:id')
  @RequirePermission('orders.read')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.flujo.obtener(id);
  }

  /** La Proforma aprobada/firmada que devolvió el cliente. */
  @Get('casos/:id/proforma-firmada')
  @RequirePermission('orders.read')
  async proformaFirmada(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const pdf = await this.flujo.proformaFirmada(id);
    if (!pdf) throw new NotFoundException('Este caso no tiene una Proforma firmada por el cliente.');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.nombre.replace(/"/g, '')}"`);
    res.send(pdf.buffer);
  }

  /** Orden de compra ingresada a mano (mismo camino que un correo del buzón de pedidos). */
  @Post('casos/oc')
  @RequirePermission('orders.create')
  recibirOc(@Body() dto: OcManualDto) {
    return this.flujo.recibirOc(
      {
        from: dto.from,
        subject: dto.subject,
        body: dto.body,
        messageId: dto.messageId ?? null,
        attachments: (dto.attachments ?? []).map((a) => ({ filename: a.filename, contentType: a.contentType ?? null, content: Buffer.from(a.contentBase64, 'base64') })),
      },
      'manual',
    );
  }

  /** Corrige lo que falte antes de crear la Proforma (líneas, destino, fecha, cliente final). */
  @Patch('casos/:id')
  @RequirePermission('orders.update')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarCasoDto) {
    return this.flujo.editar(id, dto);
  }

  /** Freno de mano: confirma la acción pendiente sobre OBEN MAS. */
  @Post('casos/:id/confirmar')
  @RequirePermission('orders.update')
  confirmar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmarDto) {
    if (dto.confirm !== true) throw new BadRequestException('Envía confirm:true para ejecutar la acción pendiente.');
    return this.flujo.confirmar(id, { verificadoEnObenMas: dto.verificadoEnObenMas });
  }

  /** (Re)envía el PDF de la Proforma al cliente. */
  @Post('casos/:id/enviar-cliente')
  @RequirePermission('orders.update')
  enviarCliente(@Param('id', ParseUUIDPipe) id: string) {
    return this.flujo.enviarAlCliente(id);
  }

  /** Respuesta del cliente que llegó por otro canal (teléfono, WhatsApp). */
  @Post('casos/:id/respuesta')
  @RequirePermission('orders.update')
  async respuesta(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RespuestaManualDto) {
    const caso = await this.flujo.obtener(id);
    const lineas = dto.lineas?.map((l, i) =>
      construirLinea(
        i + 1,
        { textoCliente: l.codigoCliente, codigoCliente: l.codigoCliente, cantidad: l.kilos, unidad: 'kg', ancho: l.anchoMm, unidadAncho: 'mm' },
        l.codigoOben ? [{ id: 'manual', clientCode: l.codigoCliente, obenCode: l.codigoOben }] : [],
      ),
    );
    return this.flujo.registrarRespuesta(caso, { tipo: dto.tipo, motivo: dto.nota, via: 'registro manual', ...(lineas ? { lineas } : {}) });
  }

  /** Dar de baja (el cliente no sigue): anula la Proforma en OBEN MAS. */
  @Post('casos/:id/anular')
  @RequirePermission('orders.update')
  anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MotivoDto) {
    return this.flujo.anular(id, dto.motivo);
  }

  @Get('configuracion')
  @RequirePermission('configuracion.read')
  config() {
    return this.flujo.config();
  }

  @Put('configuracion')
  @RequirePermission('configuracion.update')
  actualizarConfig(@Body() dto: ConfigDto) {
    return this.flujo.actualizarConfig(dto as Record<string, unknown>);
  }

  // ─── Simulador (solo con OBEN MAS en modo simulado) ─────────────────────

  /** Carga el cliente piloto SIMULADO con 10 equivalencias SIMULADAS. */
  @Post('simulador/datos-demo')
  @RequirePermission('orders.update')
  datosDemo() {
    return this.simulador.cargarDatosDemo();
  }

  /** Recibe una orden de compra de ejemplo del cliente piloto (como si llegara por correo). */
  @Post('simulador/oc-demo')
  @RequirePermission('orders.create')
  ocDemo() {
    return this.simulador.recibirOcDemo();
  }

  /** Lo que en la vida real hacen Planeación/cartera/producción en OBEN MAS. */
  @Post('simulador/proformas/:numberPF/:control')
  @RequirePermission('orders.update')
  control(@Param('numberPF') numberPF: string, @Param('control') control: string, @Body() dto: ControlSimDto) {
    return this.simulador.control(numberPF, control as ControlSimulador, dto.fecha);
  }

  /** Avanza ya los casos abiertos (sin esperar el ciclo de 1 minuto). */
  @Post('simulador/procesar')
  @RequirePermission('orders.update')
  procesar() {
    return this.simulador.procesarAhora();
  }
}
