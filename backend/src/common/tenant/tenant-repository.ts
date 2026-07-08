import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  ObjectLiteral,
} from 'typeorm';
import { TenantContext } from './tenant-context.service';

/**
 * Base para repositorios de entidades tenant-scoped.
 * Ninguna operación puede ejecutarse sin tenantId resuelto.
 * Garantiza el filtro por tenantId en TODA lectura y lo inyecta en TODA escritura.
 *
 * Uso:
 *   class ClientsRepository extends TenantRepository<Client> {
 *     constructor(@InjectRepository(Client) repo: Repository<Client>, ctx: TenantContext) {
 *       super(repo, ctx);
 *     }
 *   }
 */
export abstract class TenantRepository<
  T extends ObjectLiteral & { tenantId?: string },
> {
  constructor(
    protected readonly repo: Repository<T>,
    protected readonly ctx: TenantContext,
  ) {}

  protected withTenant<W extends FindOptionsWhere<T>>(
    where?: W,
  ): FindOptionsWhere<T> {
    return {
      ...(where ?? {}),
      tenantId: this.ctx.tenantId,
    } as FindOptionsWhere<T>;
  }

  find(options: FindManyOptions<T> = {}): Promise<T[]> {
    const where = options.where;
    const tenantWhere = { tenantId: this.ctx.tenantId } as FindOptionsWhere<T>;
    const merged: FindOptionsWhere<T> | FindOptionsWhere<T>[] = Array.isArray(
      where,
    )
      ? where.map((w) => ({ ...w, ...tenantWhere }))
      : { ...(where ?? {}), ...tenantWhere };
    return this.repo.find({ ...options, where: merged });
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    const where = options.where;
    const tenantWhere = { tenantId: this.ctx.tenantId } as FindOptionsWhere<T>;
    const merged: FindOptionsWhere<T> | FindOptionsWhere<T>[] = Array.isArray(
      where,
    )
      ? where.map((w) => ({ ...w, ...tenantWhere }))
      : { ...(where ?? {}), ...tenantWhere };
    return this.repo.findOne({ ...options, where: merged });
  }

  findOneBy(where: FindOptionsWhere<T>): Promise<T | null> {
    return this.repo.findOneBy(this.withTenant(where));
  }

  findBy(where: FindOptionsWhere<T>): Promise<T[]> {
    return this.repo.findBy(this.withTenant(where));
  }

  count(options: FindManyOptions<T> = {}): Promise<number> {
    const where = options.where;
    const tenantWhere = { tenantId: this.ctx.tenantId } as FindOptionsWhere<T>;
    const merged = Array.isArray(where)
      ? where.map((w) => ({ ...w, ...tenantWhere }))
      : { ...(where ?? {}), ...tenantWhere };
    return this.repo.count({ ...options, where: merged });
  }

  create(entity: DeepPartial<T>): T {
    return this.repo.create({
      ...entity,
      tenantId: this.ctx.tenantId,
    } as DeepPartial<T>);
  }

  async save(entity: DeepPartial<T>): Promise<T> {
    const withTenant = {
      ...entity,
      tenantId: this.ctx.tenantId,
    } as DeepPartial<T>;
    return this.repo.save(withTenant as T);
  }

  async delete(where: FindOptionsWhere<T>): Promise<number> {
    const result = await this.repo.delete(this.withTenant(where));
    return result.affected ?? 0;
  }

  /**
   * Escape hatch para operaciones legítimamente cross-tenant (superadmin, jobs internos).
   * Devuelve el Repository crudo — usar con extremo cuidado.
   */
  raw(): Repository<T> {
    if (!this.ctx.isSuperAdmin && !this.ctx.hasTenant()) {
      throw new Error('raw() requiere superadmin o tenant explícito.');
    }
    return this.repo;
  }
}
