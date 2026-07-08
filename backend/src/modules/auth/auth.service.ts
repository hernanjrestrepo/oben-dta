import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities/user.entity';
import { Tenant, TenantStatus } from '../../entities/tenant.entity';
import { RegisterDto, LoginDto, PlatformLoginDto } from './dto/auth.dto';
import { AuthorizationService } from '../security/authorization.service';
import { LicensingService } from '../security/licensing.service';

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId: string | null;
    tenantSlug: string | null;
    isSuperAdmin: boolean;
    permissions: string[];
  };
  license: {
    valid: boolean;
    reason: string | null;
    graceActive: boolean;
    daysRemaining: number | null;
    renewalDue: boolean;
  } | null;
}

/**
 * Auth tenant-aware.
 * Un usuario se identifica por (tenantId, email); dos empresas pueden compartir email.
 * Si el DTO no trae tenantSlug, se resuelve al tenant "oben" como default para preservar
 * el flujo de login del ambiente inicial. Al agregar más tenants, el frontend debe
 * pasar tenantSlug explícito (por dominio, subdominio o selección de UI).
 */
@Injectable()
export class AuthService {
  private static readonly DEFAULT_TENANT_SLUG = 'oben';
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_MS = 15 * 60 * 1000;

  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Tenant) private tenantRepository: Repository<Tenant>,
    private jwtService: JwtService,
    @Optional() private readonly authz?: AuthorizationService,
    @Optional() private readonly licensing?: LicensingService,
  ) {}

  private async resolveTenant(slug: string | undefined): Promise<Tenant> {
    const wanted = slug || AuthService.DEFAULT_TENANT_SLUG;
    const tenant = await this.tenantRepository.findOne({
      where: { slug: wanted },
    });
    if (!tenant) {
      throw new UnauthorizedException(`Tenant '${wanted}' no existe`);
    }
    if (
      tenant.status === TenantStatus.ARCHIVED ||
      tenant.status === TenantStatus.SUSPENDED
    ) {
      throw new UnauthorizedException(`Tenant '${wanted}' no está activo`);
    }
    return tenant;
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const tenant = await this.resolveTenant(dto.tenantSlug);
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email, tenantId: tenant.id },
    });
    if (existingUser) {
      throw new BadRequestException(
        'El correo ya está registrado para este tenant',
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      isActive: true,
      tenantId: tenant.id,
      isSuperAdmin: false,
    });
    await this.userRepository.save(user);
    return this.generateTokens(user, tenant);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const tenant = await this.resolveTenant(dto.tenantSlug);
    const user = await this.userRepository.findOne({
      where: { email: dto.email, tenantId: tenant.id },
    });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');
    if (!user.isActive) throw new UnauthorizedException('Usuario inactivo');
    this.assertNotLocked(user);
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    await this.resetFailedAttempts(user);
    return this.generateTokens(user, tenant);
  }

  /**
   * Login exclusivo para usuarios de plataforma (tenantId=null). El login regular
   * siempre resuelve un tenant y filtra por tenantId=tenant.id, por lo que un
   * platform user jamás matchea ahí — este es el único camino de entrada para
   * SuperAdmin Paradixe y demás roles de plataforma.
   */
  async platformLogin(dto: PlatformLoginDto): Promise<AuthResponse> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email, tenantId: IsNull() },
    });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');
    if (!user.isActive) throw new UnauthorizedException('Usuario inactivo');
    this.assertNotLocked(user);
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    await this.resetFailedAttempts(user);
    return this.generateTokens(user, null);
  }

  /**
   * Rotación de refresh tokens: cada uso invalida el anterior (avanza
   * `tokenVersion`) y emite un par nuevo. Un refresh token robado deja de
   * servir en cuanto el dueño legítimo lo use una vez más, y logout() lo
   * invalida de inmediato sin esperar a su expiración de 7 días.
   */
  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: { sub: string; ver?: number };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    if (!user.isActive) throw new UnauthorizedException('Usuario inactivo');
    if ((payload.ver ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException(
        'Refresh token revocado — inicia sesión nuevamente',
      );
    }
    const tenant = user.tenantId
      ? await this.tenantRepository.findOne({ where: { id: user.tenantId } })
      : null;
    user.tokenVersion += 1;
    await this.userRepository.save(user);
    return this.generateTokens(user, tenant);
  }

  /**
   * Invalida TODOS los refresh tokens emitidos hasta ahora para este usuario
   * (avanza tokenVersion). Los access tokens ya emitidos siguen vivos hasta
   * su expiración natural de 15 minutos — ventana aceptada a cambio de no
   * requerir una consulta a BD en cada request autenticado.
   */
  async logout(userId: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user) {
      user.tokenVersion += 1;
      await this.userRepository.save(user);
    }
    return { message: 'Sesión cerrada exitosamente' };
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  private assertNotLocked(user: User): void {
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60_000,
      );
      throw new UnauthorizedException(
        `Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta de nuevo en ${minutes} minuto(s).`,
      );
    }
  }

  private async registerFailedAttempt(user: User): Promise<void> {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= AuthService.MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + AuthService.LOCKOUT_MS);
      user.failedLoginAttempts = 0;
    }
    await this.userRepository.save(user);
  }

  private async resetFailedAttempts(user: User): Promise<void> {
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await this.userRepository.save(user);
    }
  }

  private buildPayload(user: User, tenant: Tenant | null) {
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug: tenant?.slug ?? null,
      isSuperAdmin: user.isSuperAdmin,
      ver: user.tokenVersion,
    };
  }

  private buildUserView(
    user: User,
    tenant: Tenant | null,
    permissions: string[],
  ): AuthResponse['user'] {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug: tenant?.slug ?? null,
      isSuperAdmin: user.isSuperAdmin,
      permissions,
    };
  }

  private async loadPermissions(user: User): Promise<string[]> {
    if (!this.authz) return [];
    try {
      return await this.authz.listPermissions({
        userId: user.id,
        tenantId: user.tenantId,
        isSuperAdmin: user.isSuperAdmin,
      });
    } catch {
      return [];
    }
  }

  private async loadLicenseStatus(
    tenant: Tenant | null,
  ): Promise<AuthResponse['license']> {
    if (!tenant || !this.licensing) return null;
    try {
      const result = await this.licensing.validate(tenant.id);
      return {
        valid: result.valid,
        reason: result.reason ?? null,
        graceActive: result.graceActive ?? false,
        daysRemaining: result.daysRemaining ?? null,
        renewalDue: result.renewalDue ?? false,
      };
    } catch {
      return null;
    }
  }

  private async generateTokens(
    user: User,
    tenant: Tenant | null,
  ): Promise<AuthResponse> {
    const payload = this.buildPayload(user, tenant);
    const permissions = await this.loadPermissions(user);
    const license = await this.loadLicenseStatus(tenant);
    return {
      access_token: this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      }),
      refresh_token: this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '7d',
      }),
      user: this.buildUserView(user, tenant, permissions),
      license,
    };
  }
}
