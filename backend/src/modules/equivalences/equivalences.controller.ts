import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { EquivalencesService } from './equivalences.service';
import { CreateEquivalenceDto, UpdateEquivalenceDto } from './dto/client-product-equivalence.dto';

/**
 * Administrador de homologación cliente↔producto (ver
 * ClientProductEquivalence). Reemplaza la hoja de cálculo manual de
 * Alejandra — todavía es solo CRUD, sin ningún consumidor automático.
 * Es un maestro de códigos de producto: usa los permisos de `products`.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('equivalences')
export class EquivalencesController {
  constructor(private readonly service: EquivalencesService) {}

  @Post()
  @RequirePermission('products.create')
  create(@Body() dto: CreateEquivalenceDto) {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermission('products.read')
  findAll(@Query('clientId') clientId?: string) {
    return this.service.findAll(clientId);
  }

  @Get('resolve')
  @RequirePermission('products.read')
  resolve(@Query('clientId') clientId: string, @Query('clientCode') clientCode: string) {
    return this.service.resolve(clientId, clientCode);
  }

  @Get(':id')
  @RequirePermission('products.read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('products.update')
  update(@Param('id') id: string, @Body() dto: UpdateEquivalenceDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('products.delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
