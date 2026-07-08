import {
  Injectable,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from '../../entities/tenant.entity';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { SecurityBootstrapService } from '../security/security-bootstrap.service';
import { PlansService } from '../security/plans.service';
import { LicensingService } from '../security/licensing.service';
import { SubscriptionStatus } from '../../entities/tenant-subscription.entity';

export { CreateTenantDto, UpdateTenantDto };

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly repo: Repository<Tenant>,
    @Optional() private readonly security?: SecurityBootstrapService,
    @Optional() private readonly plans?: PlansService,
    @Optional() private readonly licensing?: LicensingService,
  ) {}

  async findAll(): Promise<Tenant[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  async findById(id: string): Promise<Tenant> {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Tenant ${id} no existe`);
    return t;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const existing = await this.repo.findOne({ where: { slug: dto.slug } });
    if (existing)
      throw new ConflictException(`Tenant slug '${dto.slug}' ya existe`);
    const tenant = this.repo.create({
      slug: dto.slug,
      name: dto.name,
      legalName: dto.legalName,
      taxId: dto.taxId,
      countryCode: dto.countryCode ?? 'CO',
      defaultCurrency: dto.defaultCurrency ?? 'COP',
      timezone: dto.timezone ?? 'America/Bogota',
      status: dto.status ?? TenantStatus.ACTIVE,
      settings: dto.settings ?? {},
      integrationConfig: dto.integrationConfig ?? {},
    });
    const saved = await this.repo.save(tenant);
    await this.provisionTenant(saved);
    return saved;
  }

  /**
   * Provisiona un tenant nuevo con roles semilla y suscripción a plan starter
   * por defecto. Idempotente — se puede llamar sobre tenants ya existentes sin efecto.
   */
  async provisionTenant(tenant: Tenant): Promise<void> {
    if (this.security) {
      await this.security.ensureTenantDefaultRoles(tenant.id);
    }
    if (this.plans) {
      const existing = await this.plans.getTenantSubscription(tenant.id);
      if (!existing) {
        try {
          await this.plans.assignSubscription(tenant.id, {
            planKey: 'starter',
            status: SubscriptionStatus.TRIAL,
          });
        } catch {
          // Plan 'starter' aún no sembrado (arranque muy temprano) — se resuelve en el próximo boot.
        }
      }
    }
    if (this.licensing) {
      const existingLicense = await this.licensing.getCurrent(tenant.id);
      if (!existingLicense) {
        try {
          await this.licensing.issue(tenant.id, {
            planKey: 'starter',
            durationDays: 30,
          });
        } catch {
          // Igual que arriba: se resuelve en el próximo boot si el catálogo aún no está listo.
        }
      }
    }
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findById(id);
    Object.assign(tenant, dto);
    return this.repo.save(tenant);
  }

  async archive(id: string): Promise<Tenant> {
    const tenant = await this.findById(id);
    tenant.status = TenantStatus.ARCHIVED;
    return this.repo.save(tenant);
  }

  /**
   * Asegura la existencia del tenant "oben" (bootstrap del ambiente inicial).
   * Idempotente: si ya existe, ejecuta provisionamiento de roles/suscripción por si
   * la instalación viene desde una versión anterior sin ellos.
   */
  async ensureBootstrapTenant(): Promise<Tenant> {
    const existing = await this.repo.findOne({ where: { slug: 'oben' } });
    if (existing) {
      await this.provisionTenant(existing);
      return existing;
    }
    return this.create({
      slug: 'oben',
      name: 'Oben Group',
      legalName: 'Oben Group',
      countryCode: 'CO',
      defaultCurrency: 'COP',
      timezone: 'America/Bogota',
      status: TenantStatus.ACTIVE,
    });
  }
}
