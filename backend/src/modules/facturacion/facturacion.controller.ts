import { BadRequestException, Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { FacturacionService } from './facturacion.service';

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

  @Get(':numberOrderSales/pdf')
  @RequirePermission('invoices.read')
  async downloadPdf(@Param('numberOrderSales') numberOrderSales: string, @Res() res: Response) {
    const n = this.parseOrderNumber(numberOrderSales);
    const { filename, pdf } = await this.facturacion.generateDocument(n);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }

  @Post(':numberOrderSales/send')
  @RequirePermission('invoices.send')
  send(@Param('numberOrderSales') numberOrderSales: string, @Body() dto: FacturacionInputDto) {
    return this.facturacion.send(this.parseOrderNumber(numberOrderSales), dto, dto.force ?? false);
  }

  private parseOrderNumber(raw: string): number {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException('numberOrderSales debe ser un número de orden de venta válido');
    }
    return n;
  }
}
