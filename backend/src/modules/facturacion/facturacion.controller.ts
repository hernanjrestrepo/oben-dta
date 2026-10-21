import { BadRequestException, Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import type { LiquidacionInput } from '../liquidacion/liquidacion.types';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { FacturacionService } from './facturacion.service';

class VistaFacturaDto {
  /** Lo que COMEX tiene en pantalla en la liquidación (encabezado, Incoterm, texto junto a la partida). */
  @IsOptional()
  @IsObject()
  liquidacion?: LiquidacionInput;
}

class FacturacionInputDto {
  @IsOptional()
  @IsString()
  direccionEntrega?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsString()
  infoComercial?: string;

  @IsOptional()
  @IsBoolean()
  parcial?: boolean;

  @IsOptional()
  @IsBoolean()
  force?: boolean;

  /** TRM de la orden de compra (clientes con TRM propia, p. ej. PPC FLEX). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(1000)
  @Max(20000)
  trmOrdenCompra?: number;

  /** Destinatarios explícitos (los que se ven en pantalla). Sin ellos: lista de distribución "facturacion". */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  to?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  cc?: string[];
}

/**
 * Todas las rutas exigen permisos ya existentes del catálogo de "invoices"
 * (Facturación) — no requiere un permiso nuevo. `send` crea un correo real
 * saliente, por eso exige `invoices.send` (igual que InvoicesController).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('facturacion')
export class FacturacionController {
  constructor(private readonly facturacion: FacturacionService) {}

  /** Órdenes reales recientes (su Lista de Empaque ya salió) — atajos para la pantalla. */
  @Get('ordenes-recientes')
  @RequirePermission('invoices.read')
  ordenesRecientes() {
    return this.facturacion.ordenesRecientes();
  }

  /** A quién llegaría un envío si no se indican destinatarios (lista "facturacion"). */
  @Get('destinatarios')
  @RequirePermission('invoices.read')
  destinatarios() {
    return this.facturacion.destinatarios();
  }

  /** Proformas de exportación pendientes de aprobación de COMEX (16-oct). */
  @Get('proformas-pendientes')
  @RequirePermission('invoices.read')
  proformasPendientes() {
    return this.facturacion.proformasPendientes();
  }

  /** Órdenes de venta de una proforma: la pantalla busca por PF (reunión del 15-oct). */
  @Get('proforma/:numberPF')
  @RequirePermission('invoices.read')
  proforma(@Param('numberPF') numberPF: string) {
    return this.facturacion.ordenesDeProforma(numberPF);
  }

  @Get(':numberOrderSales/draft')
  @RequirePermission('invoices.read')
  draft(@Param('numberOrderSales') numberOrderSales: string) {
    return this.facturacion.getDraft(this.parseOrderNumber(numberOrderSales));
  }

  @Post(':numberOrderSales/draft')
  @RequirePermission('invoices.read')
  draftWithInput(@Param('numberOrderSales') numberOrderSales: string, @Body() dto: FacturacionInputDto) {
    return this.facturacion.getDraft(this.parseOrderNumber(numberOrderSales), dto);
  }

  /** Envíos previos y factura electrónica vigente de la orden. */
  @Get(':numberOrderSales/historial')
  @RequirePermission('invoices.read')
  historial(@Param('numberOrderSales') numberOrderSales: string) {
    return this.facturacion.historial(this.parseOrderNumber(numberOrderSales));
  }

  /** Cómo saldrá la factura (observaciones y totales) con lo que hay en pantalla. No emite nada. */
  @Post(':numberOrderSales/vista-factura')
  @RequirePermission('invoices.read')
  vistaFactura(@Param('numberOrderSales') numberOrderSales: string, @Body() dto: VistaFacturaDto) {
    return this.facturacion.vistaFactura(this.parseOrderNumber(numberOrderSales), dto.liquidacion);
  }

  @Get(':numberOrderSales/pdf')
  @RequirePermission('invoices.read')
  async downloadPdf(@Param('numberOrderSales') numberOrderSales: string, @Res() res: Response) {
    await this.sendPdf(this.parseOrderNumber(numberOrderSales), {}, res);
  }

  /** Igual que GET, pero con lo que el usuario digitó (dirección, observaciones, parcial) — nunca emite. */
  @Post(':numberOrderSales/pdf')
  @RequirePermission('invoices.read')
  async downloadPdfWithInput(
    @Param('numberOrderSales') numberOrderSales: string,
    @Body() dto: FacturacionInputDto,
    @Res() res: Response,
  ) {
    await this.sendPdf(this.parseOrderNumber(numberOrderSales), dto, res);
  }

  @Post(':numberOrderSales/send')
  @RequirePermission('invoices.send')
  send(@Param('numberOrderSales') numberOrderSales: string, @Body() dto: FacturacionInputDto) {
    return this.facturacion.send(this.parseOrderNumber(numberOrderSales), dto, dto.force ?? false, {
      to: dto.to,
      cc: dto.cc,
    });
  }

  private async sendPdf(n: number, dto: FacturacionInputDto, res: Response) {
    const { filename, pdf } = await this.facturacion.generateDocument(n, dto);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }

  private parseOrderNumber(raw: string): number {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException('numberOrderSales debe ser un número de orden de venta válido');
    }
    return n;
  }
}
