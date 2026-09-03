import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DistributionList } from '../../entities/distribution-list.entity';
import { DistributionListRecipient } from '../../entities/distribution-list-recipient.entity';
import {
  DistributionListAssociation,
  DistributionEntityType,
} from '../../entities/distribution-list-association.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import {
  AssociateDistributionListDto,
  CreateDistributionListDto,
  UpdateDistributionListDto,
} from './dto/distribution-list.dto';

export interface ResolvedRecipients {
  to: string[];
  cc: string[];
  bcc: string[];
}

@Injectable()
export class DistributionListsService {
  constructor(
    @InjectRepository(DistributionList)
    private readonly lists: Repository<DistributionList>,
    @InjectRepository(DistributionListRecipient)
    private readonly recipients: Repository<DistributionListRecipient>,
    @InjectRepository(DistributionListAssociation)
    private readonly associations: Repository<DistributionListAssociation>,
    private readonly ctx: TenantContext,
  ) {}

  private tenantWhere<T extends object>(where: T): T & { tenantId: string } {
    return { ...where, tenantId: this.ctx.tenantId };
  }

  async create(dto: CreateDistributionListDto): Promise<DistributionList> {
    const list = this.lists.create({
      name: dto.name,
      description: dto.description ?? null,
      tenantId: this.ctx.tenantId,
      recipients: dto.recipients.map((r) =>
        this.recipients.create({ ...r, tenantId: this.ctx.tenantId }),
      ),
    });
    return this.lists.save(list);
  }

  async findAll(): Promise<DistributionList[]> {
    return this.lists.find({
      where: { tenantId: this.ctx.tenantId },
      relations: ['recipients', 'associations'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<DistributionList> {
    const list = await this.lists.findOne({
      where: this.tenantWhere({ id }),
      relations: ['recipients', 'associations'],
    });
    if (!list) {
      throw new NotFoundException(`Lista de distribución ${id} no encontrada`);
    }
    return list;
  }

  async update(id: string, dto: UpdateDistributionListDto): Promise<DistributionList> {
    const list = await this.findOne(id);
    if (dto.name !== undefined) list.name = dto.name;
    if (dto.description !== undefined) list.description = dto.description;
    if (dto.recipients !== undefined) {
      await this.recipients.delete(this.tenantWhere({ distributionListId: id }));
      list.recipients = dto.recipients.map((r) =>
        this.recipients.create({ ...r, tenantId: this.ctx.tenantId, distributionListId: id }),
      );
    }
    return this.lists.save(list);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.lists.delete(this.tenantWhere({ id }));
  }

  async associate(id: string, dto: AssociateDistributionListDto): Promise<DistributionListAssociation> {
    await this.findOne(id);
    const existing = await this.associations.findOne({
      where: this.tenantWhere({
        distributionListId: id,
        entityType: dto.entityType,
        entityKey: dto.entityKey,
      }),
    });
    if (existing) return existing;
    const association = this.associations.create({
      ...dto,
      tenantId: this.ctx.tenantId,
      distributionListId: id,
    });
    return this.associations.save(association);
  }

  async dissociate(id: string, associationId: string): Promise<void> {
    await this.associations.delete(
      this.tenantWhere({ id: associationId, distributionListId: id }),
    );
  }

  /**
   * Resuelve todos los destinatarios (Para/Copia/CCO) de todas las listas
   * asociadas a un entityType+entityKey dado (ej: 'document'+'packing_list').
   * Si no hay ninguna lista asociada, devuelve arrays vacíos — el llamador
   * decide qué hacer (típicamente: pedirle el correo a mano al usuario, no
   * inventar un destinatario).
   */
  async resolveRecipients(
    entityType: DistributionEntityType,
    entityKey: string,
  ): Promise<ResolvedRecipients> {
    const assocs = await this.associations.find({
      where: this.tenantWhere({ entityType, entityKey }),
    });
    if (assocs.length === 0) return { to: [], cc: [], bcc: [] };

    const listIds = [...new Set(assocs.map((a) => a.distributionListId))];
    const recipients = await this.recipients.find({
      where: listIds.map((distributionListId) =>
        this.tenantWhere({ distributionListId }),
      ),
    });

    const result: ResolvedRecipients = { to: [], cc: [], bcc: [] };
    for (const r of recipients) {
      result[r.role].push(r.email);
    }
    return result;
  }
}
