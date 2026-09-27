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
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
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
 *
 * Decide a quién le llegan documentos reales de clientes (Lista de Empaque,
 * Facturación...): modificarla exige `configuracion.update`, no solo estar
 * autenticado — antes cualquier usuario podía redirigir esos correos.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('distribution-lists')
export class DistributionListsController {
  constructor(private readonly service: DistributionListsService) {}

  @Post()
  @RequirePermission('configuracion.update')
  create(@Body() dto: CreateDistributionListDto) {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermission('configuracion.read')
  findAll() {
    return this.service.findAll();
  }

  @Get('lookup')
  @RequirePermission('configuracion.read')
  lookup(
    @Query('entityType') entityType: DistributionEntityType,
    @Query('entityKey') entityKey: string,
  ) {
    return this.service.resolveRecipients(entityType, entityKey);
  }

  @Get(':id')
  @RequirePermission('configuracion.read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('configuracion.update')
  update(@Param('id') id: string, @Body() dto: UpdateDistributionListDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('configuracion.update')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/associations')
  @RequirePermission('configuracion.update')
  associate(@Param('id') id: string, @Body() dto: AssociateDistributionListDto) {
    return this.service.associate(id, dto);
  }

  @Delete(':id/associations/:associationId')
  @RequirePermission('configuracion.update')
  dissociate(@Param('id') id: string, @Param('associationId') associationId: string) {
    return this.service.dissociate(id, associationId);
  }
}
