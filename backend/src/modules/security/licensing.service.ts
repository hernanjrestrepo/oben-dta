import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { License, LicenseStatus } from '../../entities/license.entity';
import { Tenant } from '../../entities/tenant.entity';
import {
  LicenseSigningService,
  LicenseClaims,
} from './license-signing.service';

export type LicenseValidationReason =
  | 'no_license'
  | 'tampered'
  | 'expired'
  | 'suspended'
  | 'revoked';

export interface LicenseValidation {
  valid: boolean;
  reason?: LicenseValidationReason;
  license?: License;
  graceActive?: boolean;
  daysRemaining?: number;
  renewalDue?: boolean;
}

/**
 * Ciclo de vida de la licencia comercial: emisión, renovación y validación.
 * Distinto de LicenseService (que resuelve qué MÓDULOS ve un tenant según su
 * plan/feature flags) — este servicio resuelve SI el tenant puede operar.
 *
 * validate() NUNCA confía en la columna `status` ni en `expires_at` sin antes
 * recomputar la firma sobre el contenido actual de la fila. Si alguien edita
 * `expires_at` directo en Postgres, la firma deja de coincidir y la licencia
 * se trata como inválida (`tampered`) sin importar qué diga la columna.
 */
@Injectable()
export class LicensingService {
  constructor(
    @InjectRepository(License) private readonly licenses: Repository<License>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly signing: LicenseSigningService,
  ) {}

  async issue(
    tenantId: string,
    dto: {
      planKey: string;
      durationDays?: number;
      maxUsers?: number;
      maxSites?: number;
      gracePeriodDays?: number;
      offline?: boolean;
    },
  ): Promise<License> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} no existe`);
    if (!tenant.installationId) {
      tenant.installationId = randomUUID();
      await this.tenants.save(tenant);
    }

    const existing = await this.licenses.findOne({ where: { tenantId } });
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + (dto.durationDays ?? 30) * 86_400_000,
    );

    const claims: LicenseClaims = {
      licenseId: existing?.id ?? randomUUID(),
      tenantId,
      installationId: tenant.installationId,
      planKey: dto.planKey,
      status: LicenseStatus.ACTIVE,
      maxUsers: dto.maxUsers ?? 0,
      maxSites: dto.maxSites ?? 1,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      gracePeriodDays: dto.gracePeriodDays ?? 7,
      offline: dto.offline ?? false,
    };
    const { signature, keyId } = this.signing.sign(claims);

    const license =
      existing ?? this.licenses.create({ id: claims.licenseId, tenantId });
    license.installationId = tenant.installationId;
    license.planKey = claims.planKey;
    license.status = LicenseStatus.ACTIVE;
    license.maxUsers = claims.maxUsers;
    license.maxSites = claims.maxSites;
    license.issuedAt = now;
    license.activatedAt = license.activatedAt ?? now;
    license.expiresAt = expiresAt;
    license.gracePeriodDays = claims.gracePeriodDays;
    license.offline = claims.offline;
    license.signature = signature;
    license.signingKeyId = keyId;
    return this.licenses.save(license);
  }

  async renew(
    tenantId: string,
    dto: { durationDays?: number; expiresAt?: string },
  ): Promise<License> {
    const license = await this.licenses.findOne({ where: { tenantId } });
    if (!license)
      throw new NotFoundException(
        `El tenant ${tenantId} no tiene licencia emitida`,
      );
    if (!dto.durationDays && !dto.expiresAt) {
      throw new BadRequestException('Debe indicar durationDays o expiresAt');
    }

    const newExpiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + (dto.durationDays ?? 30) * 86_400_000);

    const claims: LicenseClaims = {
      licenseId: license.id,
      tenantId: license.tenantId,
      installationId: license.installationId,
      planKey: license.planKey,
      status: LicenseStatus.ACTIVE,
      maxUsers: license.maxUsers,
      maxSites: license.maxSites,
      issuedAt: license.issuedAt.toISOString(),
      expiresAt: newExpiresAt.toISOString(),
      gracePeriodDays: license.gracePeriodDays,
      offline: license.offline,
    };
    const { signature, keyId } = this.signing.sign(claims);

    license.status = LicenseStatus.ACTIVE;
    license.expiresAt = newExpiresAt;
    license.signature = signature;
    license.signingKeyId = keyId;
    license.lastRenewalRequestAt = null;
    return this.licenses.save(license);
  }

  async setStatus(tenantId: string, status: LicenseStatus): Promise<License> {
    const license = await this.licenses.findOne({ where: { tenantId } });
    if (!license)
      throw new NotFoundException(
        `El tenant ${tenantId} no tiene licencia emitida`,
      );

    const claims = this.toClaims(license);
    claims.status = status;
    const { signature, keyId } = this.signing.sign(claims);

    license.status = status;
    license.signature = signature;
    license.signingKeyId = keyId;
    return this.licenses.save(license);
  }

  async getCurrent(tenantId: string): Promise<License | null> {
    return this.licenses.findOne({ where: { tenantId } });
  }

  async validate(tenantId: string): Promise<LicenseValidation> {
    const license = await this.licenses.findOne({ where: { tenantId } });
    if (!license) return { valid: false, reason: 'no_license' };

    const claims = this.toClaims(license);
    const signatureOk = this.signing.verify(claims, license.signature);
    if (!signatureOk) return { valid: false, reason: 'tampered', license };

    if (license.status === LicenseStatus.REVOKED) {
      return { valid: false, reason: 'revoked', license };
    }
    if (license.status === LicenseStatus.SUSPENDED) {
      return { valid: false, reason: 'suspended', license };
    }

    const now = Date.now();
    const expiresAtMs = license.expiresAt.getTime();
    const graceEndsAtMs = expiresAtMs + license.gracePeriodDays * 86_400_000;
    const daysRemaining = Math.ceil((expiresAtMs - now) / 86_400_000);
    const renewalDue = new Date().getDate() >= 15 && daysRemaining <= 30;

    if (now > graceEndsAtMs) {
      return {
        valid: false,
        reason: 'expired',
        license,
        daysRemaining,
        renewalDue: true,
      };
    }
    if (now > expiresAtMs) {
      // Vencida pero dentro del período de gracia offline: se permite operar con aviso.
      return {
        valid: true,
        license,
        graceActive: true,
        daysRemaining,
        renewalDue: true,
      };
    }

    return {
      valid: true,
      license,
      graceActive: false,
      daysRemaining,
      renewalDue,
    };
  }

  private toClaims(license: License): LicenseClaims {
    return {
      licenseId: license.id,
      tenantId: license.tenantId,
      installationId: license.installationId,
      planKey: license.planKey,
      status: license.status,
      maxUsers: license.maxUsers,
      maxSites: license.maxSites,
      issuedAt: license.issuedAt.toISOString(),
      expiresAt: license.expiresAt.toISOString(),
      gracePeriodDays: license.gracePeriodDays,
      offline: license.offline,
    };
  }
}
