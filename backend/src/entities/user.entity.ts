import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  SALES = 'sales',
  PRODUCTION = 'production',
  FINANCE = 'finance',
}

/**
 * Un usuario pertenece a un tenant. La única excepción es el superadmin de plataforma
 * (isSuperAdmin=true, tenantId=null) que puede operar cross-tenant desde el panel de administración
 * de la plataforma. El uniqueness de email es por tenant, no global — dos empresas distintas
 * pueden tener usuarios con el mismo correo.
 */
@Entity('users')
@Unique('uq_users_tenant_email', ['tenantId', 'email'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'is_super_admin', default: false })
  isSuperAdmin: boolean;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column()
  email: string;

  @Column()
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.SALES })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  googleId: string;

  @Column({ nullable: true })
  microsoftId: string;

  @Column({ name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'token_version', default: 0 })
  tokenVersion: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
