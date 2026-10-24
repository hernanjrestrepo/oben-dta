import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TraducirCampos } from '../traduccion/traductor.service';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsOptional, Matches } from 'class-validator';
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

class ReenviarAvisoDto {
  /** Sin esto el aviso va a la lista de Facturación; con esto, solo a esas personas. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  para?: string[];
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
  // El motivo de cada solicitud (solo se muestra) sale en el idioma de la persona.
  @TraducirCampos('error')
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

  /** Registro crudo de las llamadas a la API de factura de Oben de un día (hora de Bogotá), para cruzar con Oben. */
  @Get('llamadas')
  @RequirePermission('invoices.read')
  llamadas(@Query('fecha') fecha?: string) {
    return this.parciales.llamadasDelDia(fecha);
  }

  /** Reenvía el correo de resultado (con la factura en PDF o la explicación de la falla). No pide nada a Oben. */
  @Post(':id/reenviar-aviso')
  @RequirePermission('invoices.send')
  reenviarAviso(@Param('id') id: string, @Body() dto: ReenviarAvisoDto) {
    return this.parciales.reenviarAviso(id, dto.para);
  }
}
