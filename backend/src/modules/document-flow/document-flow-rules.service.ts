import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentFlowRule } from '../../entities/document-flow-rule.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import {
  CreateDocumentFlowRuleDto,
  UpdateDocumentFlowRuleDto,
} from './dto/document-flow-rule.dto';

/**
 * CRUD de configuración del motor — sin esto las reglas solo podrían
 * cargarse a mano en la base de datos, lo que contradice "todo debe
 * resolverse mediante configuración".
 */
@Injectable()
export class DocumentFlowRulesService {
  constructor(
    @InjectRepository(DocumentFlowRule)
    private readonly repo: Repository<DocumentFlowRule>,
    private readonly ctx: TenantContext,
  ) {}

  findAll(): Promise<DocumentFlowRule[]> {
    return this.repo.find({
      where: { tenantId: this.ctx.tenantId },
      order: { triggerEvent: 'ASC', priority: 'DESC' },
    });
  }

  async findOne(id: string): Promise<DocumentFlowRule> {
    const rule = await this.repo.findOne({
      where: { id, tenantId: this.ctx.tenantId },
    });
    if (!rule) throw new NotFoundException('DocumentFlowRule no encontrada');
    return rule;
  }

  create(dto: CreateDocumentFlowRuleDto): Promise<DocumentFlowRule> {
    const rule = this.repo.create({
      ...dto,
      tenantId: this.ctx.tenantId,
    } as Partial<DocumentFlowRule>);
    return this.repo.save(rule);
  }

  async update(
    id: string,
    dto: UpdateDocumentFlowRuleDto,
  ): Promise<DocumentFlowRule> {
    const rule = await this.findOne(id);
    Object.assign(rule, dto);
    return this.repo.save(rule);
  }

  async remove(id: string): Promise<void> {
    const rule = await this.findOne(id);
    await this.repo.remove(rule);
  }
}
