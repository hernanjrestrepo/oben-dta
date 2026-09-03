import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DistributionListsService } from './distribution-lists.service';
import {
  AssociateDistributionListDto,
  CreateDistributionListDto,
  UpdateDistributionListDto,
} from './dto/distribution-list.dto';
import type { DistributionEntityType } from '../../entities/distribution-list-association.entity';

/**
 * Listas de distribución de correo, reutilizables y asociables a un tipo de
 * documento/transacción/reporte (ej: 'document'+'packing_list'). Cuando un
 * módulo necesita mandar algo (lista de empaque, factura, reporte) y no
 * recibe un destinatario explícito, consulta GET /distribution-lists/lookup
 * para resolver a quién enviar según lo configurado aquí.
 */
@UseGuards(JwtAuthGuard)
@Controller('distribution-lists')
export class DistributionListsController {
  constructor(private readonly service: DistributionListsService) {}

  @Post()
  create(@Body() dto: CreateDistributionListDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('lookup')
  lookup(
    @Query('entityType') entityType: DistributionEntityType,
    @Query('entityKey') entityKey: string,
  ) {
    return this.service.resolveRecipients(entityType, entityKey);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDistributionListDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/associations')
  associate(@Param('id') id: string, @Body() dto: AssociateDistributionListDto) {
    return this.service.associate(id, dto);
  }

  @Delete(':id/associations/:associationId')
  dissociate(@Param('id') id: string, @Param('associationId') associationId: string) {
    return this.service.dissociate(id, associationId);
  }
}
