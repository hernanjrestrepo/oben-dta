import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

/**
 * Administración de tenants (Paradixe platform). Protegido por permisos de plataforma.
 */
@Controller('platform/tenants')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @RequirePermission('platform.tenants.read')
  findAll() {
    return this.tenants.findAll();
  }

  @Get(':id')
  @RequirePermission('platform.tenants.read')
  findOne(@Param('id') id: string) {
    return this.tenants.findById(id);
  }

  @Post()
  @RequirePermission('platform.tenants.manage')
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Patch(':id')
  @RequirePermission('platform.tenants.manage')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('platform.tenants.manage')
  archive(@Param('id') id: string) {
    return this.tenants.archive(id);
  }
}
