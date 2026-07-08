import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum LicenseStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
}

/**
 * Licencia comercial de una instalación (distinta de TenantSubscription, que
 * resuelve QUÉ MÓDULOS ve el tenant). License resuelve SI el tenant puede
 * operar en absoluto: expiración, firma criptográfica, protección contra
 * manipulación manual de la fila.
 *
 * `signature` es una firma Ed25519 (clave privada solo en el emisor) sobre el
 * JSON canónico de los campos de negocio (ver LicenseSigningService). Cualquier
 * UPDATE manual en BD sobre esos campos invalida la firma sin tocar `status`,
 * por lo que `validate()` siempre recalcula la firma en vez de confiar en columnas.
 */
@Entity('licenses')
export class License {
  @PrimaryGeneratedColumn('uuid')
  id: string; // licenseId

  @Index({ unique: true })
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string; // companyId

  @Index({ unique: true })
  @Column({ name: 'installation_id', type: 'uuid' })
  installationId: string;

  @Column({ name: 'plan_key', length: 64 })
  planKey: string;

  @Column({ length: 16, default: LicenseStatus.ACTIVE })
  status: LicenseStatus;

  @Column({ name: 'max_users', type: 'int', default: 0 })
  maxUsers: number;

  @Column({ name: 'max_sites', type: 'int', default: 1 })
  maxSites: number;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt: Date;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'grace_period_days', type: 'int', default: 7 })
  gracePeriodDays: number;

  @Column({ default: false })
  offline: boolean;

  @Column({ type: 'text' })
  signature: string;

  @Column({ name: 'signing_key_id', length: 32 })
  signingKeyId: string;

  @Column({
    name: 'last_renewal_request_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastRenewalRequestAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
