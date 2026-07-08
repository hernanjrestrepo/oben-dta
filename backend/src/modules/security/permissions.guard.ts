import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from './authorization.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import {
  PermissionRequirement,
  REQUIRE_PERMISSION_KEY,
} from './require-permission.decorator';

/**
 * PermissionsGuard aplica @RequirePermission en cada endpoint anotado.
 *
 * Solo actúa cuando hay metadata REQUIRE_PERMISSION_KEY presente. Si el
 * endpoint no está anotado, el guard deja pasar (política: opt-in). Esto
 * evita romper controladores todavía no migrados; el bloque 10 documenta la
 * política de "todo endpoint autenticado debe declarar permiso" y añade un
 * lint/test que la fuerce.
 *
 * DEBE ejecutarse DESPUÉS de JwtAuthGuard (que puebla req.user) y DESPUÉS
 * del TenantInterceptor (que puebla TenantContext).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
    private readonly ctx: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement || !requirement.permissions?.length) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      user?: { sub: string; tenantId: string | null; isSuperAdmin: boolean };
      path?: string;
      method?: string;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();

    if (!req.user?.sub) {
      throw new ForbiddenException('No autenticado');
    }

    // El TenantInterceptor corre DESPUÉS de los guards, por lo que TenantContext
    // aún no tiene tenantId aquí. Leemos directo del JWT payload (populado por
    // JwtAuthGuard, que corre antes que este guard) para evaluar el permiso.
    // El interceptor poblará TenantContext antes de que se ejecute el handler.
    let tenantId: string | null = req.user.tenantId ?? null;
    if (req.user.isSuperAdmin) {
      const impersonated = req.headers?.['x-tenant-id'];
      if (typeof impersonated === 'string' && impersonated.length > 0) {
        tenantId = impersonated;
      }
    }

    const subject = {
      userId: req.user.sub,
      tenantId,
      isSuperAdmin: !!req.user.isSuperAdmin,
    };
    const ctxMeta = {
      route: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: this.readHeader(req.headers, 'user-agent'),
      requestId: this.readHeader(req.headers, 'x-request-id'),
    };

    if (requirement.mode === 'any') {
      const failures: string[] = [];
      for (const permission of requirement.permissions) {
        const decision = await this.authz.can({ subject, permission, context: ctxMeta });
        if (decision.effect === 'allow') return true;
        failures.push(`${permission}:${decision.reason}`);
      }
      throw new ForbiddenException(`Permiso denegado (any): ${failures.join(', ')}`);
    }

    // mode = 'all'
    for (const permission of requirement.permissions) {
      const decision = await this.authz.can({ subject, permission, context: ctxMeta });
      if (decision.effect !== 'allow') {
        throw new ForbiddenException(
          `Permiso denegado: ${permission} (${decision.reason})`,
        );
      }
    }
    return true;
  }

  private readHeader(
    headers: Record<string, string | string[] | undefined> | undefined,
    name: string,
  ): string | undefined {
    if (!headers) return undefined;
    const v = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(v)) return v[0];
    return v;
  }
}
