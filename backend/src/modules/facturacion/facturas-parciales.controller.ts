import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, Matches } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { FacturasParcialesService } from './facturas-parciales.service';

class RegistrarParcialDto {
  @Matches(/^\d{1,12}$/, { message: 'La proforma debe ser numérica' })
  numberPF!: string;

  @Matches(/^\d{1,12}$/, { message: 'El número de distribución debe ser numérico' })
  numeroDistribucion!: string;
}

class FacturarParcialDto {
  @IsOptional()
  @IsBoolean()
  confirmoQueNoExiste?: boolean;
}

/**
 * Facturas parciales (WO-023). Ver exige `invoices.read`; registrar y
 * facturar en OBEN MAS exigen `invoices.create`.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('facturacion/parciales')
export class FacturasParcialesController {
  constructor(private readonly parciales: FacturasParcialesService) {}

  @Get()
  @RequirePermission('invoices.read')
  listar(@Query('limite') limite?: string) {
    return this.parciales.listar(Number(limite) || 50);
  }

  @Post()
  @RequirePermission('invoices.create')
  registrar(@Body() dto: RegistrarParcialDto) {
    return this.parciales.registrarManual(dto.numberPF, dto.numeroDistribucion);
  }

  @Post(':id/facturar')
  @RequirePermission('invoices.create')
  facturar(@Param('id') id: string, @Body() dto: FacturarParcialDto) {
    return this.parciales.facturar(id, dto.confirmoQueNoExiste === true);
  }
}
