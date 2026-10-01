import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
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
  RecipientDto,
  UpdateDistributionListDto,
} from './dto/distribution-list.dto';
import { AuthorizationService } from '../security/authorization.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { ENVIOS_CATALOGO } from './envios-catalogo';

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
    @Optional() private readonly authz?: AuthorizationService,
    @Optional() private readonly audit?: WorkflowAuditService,
  ) {}

  /** Qué se puede enviar y asociar a una lista (WO-026). */
  catalogo() {
    return ENVIOS_CATALOGO.map(({ clave, label, descripcion, grupo, manual }) => ({ clave, label, descripcion, grupo, manual }));
  }

  private async tienePermiso(permiso: string): Promise<boolean> {
    const userId = this.ctx.userId;
    if (!userId || !this.authz) return false;
    const d = await this.authz.can({
      subject: { userId, tenantId: this.ctx.tenantIdOrNull, isSuperAdmin: this.ctx.isSuperAdmin },
      permission: permiso,
      context: { route: '/distribution-lists', method: 'GET' },
    });
    return d.effect === 'allow';
  }

  /**
   * Administración (`configuracion.update`) o un dueño de la lista. Devuelve
   * la lista; si no puede gestionarla, 403 — nunca se revela otra lista.
   */
  async asegurarGestion(id: string): Promise<DistributionList> {
    const list = await this.findOne(id);
    if (await this.tienePermiso('configuracion.update')) return list;
    const userId = this.ctx.userId;
    if (userId && (list.ownerUserIds ?? []).includes(userId)) return list;
    throw new ForbiddenException('Solo administración o un dueño de esta lista pueden gestionarla.');
  }

  /** Administración ve todas; un usuario sin permiso de configuración solo las listas de las que es dueño. */
  async visibles(): Promise<DistributionList[]> {
    const todas = await this.findAll();
    if (await this.tienePermiso('configuracion.read')) return todas;
    const userId = this.ctx.userId;
    return userId ? todas.filter((l) => (l.ownerUserIds ?? []).includes(userId)) : [];
  }

  /** Un dueño (o administración) reemplaza los destinatarios; queda en auditoría quién y qué cambió. */
  async actualizarDestinatarios(id: string, recipients: RecipientDto[]): Promise<DistributionList> {
    const list = await this.asegurarGestion(id);
    const antes = list.recipients.map((r) => `${r.role}:${r.email}`);
    const actualizada = await this.update(id, { recipients });
    await this.audit?.log({
      workflowName: 'distribution-lists',
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: 'lista_destinatarios_actualizados',
      entityType: 'distribution_list',
      entityId: id,
      actorId: this.ctx.userId,
      inputData: { lista: list.name, antes },
      outputData: { despues: recipients.map((r) => `${r.role}:${r.email}`) },
    });
    return actualizada;
  }

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
    if (dto.ownerUserIds !== undefined) list.ownerUserIds = [...new Set(dto.ownerUserIds)];
    if (dto.disparador !== undefined) list.disparador = dto.disparador;
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
    // TypeORM IGNORA las condiciones `undefined` del where: sin esto, un
    // lookup sin parámetros mezclaba los destinatarios de TODAS las listas.
    if (!entityType || !entityKey) {
      throw new BadRequestException('entityType y entityKey son obligatorios para resolver destinatarios.');
    }
    const assocs = await this.associations.find({
      where: this.tenantWhere({ entityType, entityKey }),
    });
    if (assocs.length === 0) return { to: [], cc: [], bcc: [] };

    // Las listas con disparador 'manual' solo reciben con "Enviar ahora" (WO-026).
    const manuales = new Set(
      ((await this.lists.find({ where: this.tenantWhere({ disparador: 'manual' as const }) })) ?? []).map((l) => l.id),
    );
    const listIds = [...new Set(assocs.map((a) => a.distributionListId))].filter((id) => !manuales.has(id));
    if (listIds.length === 0) return { to: [], cc: [], bcc: [] };
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
