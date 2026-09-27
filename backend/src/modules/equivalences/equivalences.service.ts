import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProductEquivalence } from '../../entities/client-product-equivalence.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { CreateEquivalenceDto, UpdateEquivalenceDto } from './dto/client-product-equivalence.dto';

const DUPLICATE_KEY_CODE = '23505';

/**
 * Homologación cliente↔producto (ver ClientProductEquivalence). Puro CRUD
 * administrable — todavía no la consulta ningún flujo automático: eso
 * depende de la interpretación de órdenes de compra vía IA, que a su vez
 * depende de la API de OBEN MAS/Oben+ (sin construir, ver blueprint
 * Comercial 2026-09-27).
 */
@Injectable()
export class EquivalencesService {
  constructor(
    @InjectRepository(ClientProductEquivalence)
    private readonly repo: Repository<ClientProductEquivalence>,
    private readonly ctx: TenantContext,
  ) {}

  async create(dto: CreateEquivalenceDto): Promise<ClientProductEquivalence> {
    const entity = this.repo.create({ ...dto, tenantId: this.ctx.tenantId });
    try {
      return await this.repo.save(entity);
    } catch (err) {
      throw this.mapWriteError(err, dto.clientCode);
    }
  }

  async findAll(clientId?: string): Promise<ClientProductEquivalence[]> {
    return this.repo.find({
      where: { tenantId: this.ctx.tenantId, ...(clientId ? { clientId } : {}) },
      order: { clientCode: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ClientProductEquivalence> {
    const found = await this.repo.findOne({ where: { tenantId: this.ctx.tenantId, id } });
    if (!found) throw new NotFoundException(`Equivalencia ${id} no encontrada`);
    return found;
  }

  async update(id: string, dto: UpdateEquivalenceDto): Promise<ClientProductEquivalence> {
    const equivalence = await this.findOne(id);
    Object.assign(equivalence, dto);
    try {
      return await this.repo.save(equivalence);
    } catch (err) {
      throw this.mapWriteError(err, dto.clientCode ?? equivalence.clientCode);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete({ tenantId: this.ctx.tenantId, id });
  }

  /**
   * Resuelve la referencia interna de Oben a partir de cómo la nombró el
   * cliente en su orden de compra. `null` si no hay homologación registrada
   * — nunca se adivina un código que no está en la tabla.
   */
  async resolve(clientId: string, clientCode: string): Promise<string | null> {
    const found = await this.repo.findOne({
      where: { tenantId: this.ctx.tenantId, clientId, clientCode },
    });
    return found?.obenCode ?? null;
  }

  private mapWriteError(err: unknown, clientCode: string): Error {
    if ((err as { code?: string }).code === DUPLICATE_KEY_CODE) {
      return new ConflictException(`Ya existe una equivalencia para "${clientCode}" con este cliente.`);
    }
    return err as Error;
  }
}
