import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EquivalencesService } from './equivalences.service';
import { CreateEquivalenceDto, UpdateEquivalenceDto } from './dto/client-product-equivalence.dto';

/**
 * Administrador de homologación cliente↔producto (ver
 * ClientProductEquivalence). Reemplaza la hoja de cálculo manual de
 * Alejandra — todavía es solo CRUD, sin ningún consumidor automático.
 */
@UseGuards(JwtAuthGuard)
@Controller('equivalences')
export class EquivalencesController {
  constructor(private readonly service: EquivalencesService) {}

  @Post()
  create(@Body() dto: CreateEquivalenceDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('clientId') clientId?: string) {
    return this.service.findAll(clientId);
  }

  @Get('resolve')
  resolve(@Query('clientId') clientId: string, @Query('clientCode') clientCode: string) {
    return this.service.resolve(clientId, clientCode);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEquivalenceDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
