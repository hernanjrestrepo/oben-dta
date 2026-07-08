import { Column, Index } from 'typeorm';

/**
 * Base para cualquier entidad de negocio que pertenece a un tenant.
 * Impone tenantId no-nulo + índice. Toda entidad multi-tenant DEBE extender esta clase.
 * El filtro por tenantId lo aplica el TenantRepository (nunca escribir queries sin él).
 */
export abstract class TenantScopedEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;
}
