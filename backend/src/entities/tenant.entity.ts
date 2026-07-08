import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  TRIAL = 'trial',
  ARCHIVED = 'archived',
}

/**
 * Tenant = empresa cliente de la plataforma SaaS.
 * Nomenclatura snake_case en BD para consistencia con Postgres estándar.
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64, unique: true })
  slug: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'legal_name', length: 255, nullable: true })
  legalName: string;

  @Column({ name: 'tax_id', length: 64, nullable: true })
  taxId: string;

  @Column({ name: 'country_code', length: 8, default: 'CO' })
  countryCode: string;

  @Column({ name: 'default_currency', length: 8, default: 'COP' })
  defaultCurrency: string;

  @Column({ length: 64, default: 'America/Bogota' })
  timezone: string;

  @Column({ length: 16, default: TenantStatus.TRIAL })
  status: TenantStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  settings: Record<string, unknown>;

  @Column({ name: 'integration_config', type: 'jsonb', default: () => "'{}'" })
  integrationConfig: Record<string, unknown>;

  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
