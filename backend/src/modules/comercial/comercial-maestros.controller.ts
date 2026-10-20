import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { ComercialMaestrosService } from './comercial-maestros.service';

/** Maestros comerciales de Oben (solo lectura). Hoy salen del servidor de pruebas de Oben. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comercial/maestros')
export class ComercialMaestrosController {
  constructor(private readonly maestros: ComercialMaestrosService) {}

  @Get()
  @RequirePermission('orders.read')
  catalogo() {
    return this.maestros.catalogo();
  }

  /** ?producto=&cliente=&direccion=&ciudad= (códigos CodSec de Oben). */
  @Get('consultas/validar-empaque')
  @RequirePermission('orders.read')
  validarEmpaque(@Query('cliente') cliente: string, @Query('direccion') direccion: string, @Query('producto') producto: string, @Query('ciudad') ciudad: string) {
    return this.maestros.validarEmpaque({ codSecEntity: Number(cliente), codSecEntityAddress: Number(direccion), codSecProduct: Number(producto), codSecCity: Number(ciudad) });
  }

  @Get('consultas/parametrizacion')
  @RequirePermission('orders.read')
  parametrizacion(@Query('cliente') cliente: string, @Query('destino') destino: string) {
    return this.maestros.parametrizacion({ codSecEntity: Number(cliente), targetCustomer: destino ?? '' });
  }

  /** clientes | productos | partidas | ciudades. ?buscar=texto&limite=100&refrescar=true */
  @Get(':maestro')
  @RequirePermission('orders.read')
  maestro(@Param('maestro') maestro: string, @Query('buscar') buscar?: string, @Query('limite') limite?: string, @Query('refrescar') refrescar?: string) {
    return this.maestros.maestro(maestro, { buscar, limite: limite ? Number(limite) : undefined, refrescar: refrescar === 'true' });
  }
}
