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
import { DocumentFlowRulesService } from './document-flow-rules.service';
import {
  CreateDocumentFlowRuleDto,
  UpdateDocumentFlowRuleDto,
} from './dto/document-flow-rule.dto';

/**
 * Configuración del Motor de Orquestación Documental. Reutiliza el módulo de
 * permisos "automations" (Motor de reglas) ya existente en el catálogo RBAC.
 */
@Controller('document-flow/rules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentFlowRulesController {
  constructor(private readonly rules: DocumentFlowRulesService) {}

  @Get()
  @RequirePermission('automations.read')
  findAll() {
    return this.rules.findAll();
  }

  @Get(':id')
  @RequirePermission('automations.read')
  findOne(@Param('id') id: string) {
    return this.rules.findOne(id);
  }

  @Post()
  @RequirePermission('automations.create')
  create(@Body() dto: CreateDocumentFlowRuleDto) {
    return this.rules.create(dto);
  }

  @Patch(':id')
  @RequirePermission('automations.update')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentFlowRuleDto) {
    return this.rules.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('automations.delete')
  remove(@Param('id') id: string) {
    return this.rules.remove(id);
  }
}
