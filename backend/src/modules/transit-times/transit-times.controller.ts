import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { TabularImportDto } from '../../common/import/tabular-import';
import { TransitTimesService } from './transit-times.service';
import { CreateTransitTimeDto, UpdateTransitTimeDto } from './dto/transit-time.dto';

/** Tiempos de tránsito por país / puerto / incoterm y festivos de Colombia (maestro de datos: usa los permisos de `products`). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('transit-times')
export class TransitTimesController {
  constructor(private readonly service: TransitTimesService) {}

  @Get()
  @RequirePermission('products.read')
  list() {
    return this.service.list();
  }

  @Get('festivos')
  @RequirePermission('products.read')
  festivos(@Query('anio', ParseIntPipe) anio: number) {
    return this.service.festivos(anio);
  }

  /** Simula la fecha de despacho: `entrega` (AAAA-MM-DD) menos los días hábiles de tránsito al puerto con ese incoterm. */
  @Get('despacho')
  @RequirePermission('products.read')
  despacho(@Query('entrega') entrega: string, @Query('pais') pais?: string, @Query('puerto') puerto?: string, @Query('incoterm') incoterm?: string) {
    return this.service.despacho(entrega, { pais, puerto, incoterm });
  }

  @Post()
  @RequirePermission('products.create')
  create(@Body() dto: CreateTransitTimeDto) {
    return this.service.create(dto);
  }

  @Post('import')
  @RequirePermission('products.create')
  importTransitos(@Body() dto: TabularImportDto) {
    return this.service.importTransitos(dto);
  }

  @Patch(':id')
  @RequirePermission('products.update')
  update(@Param('id') id: string, @Body() dto: UpdateTransitTimeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('products.delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
