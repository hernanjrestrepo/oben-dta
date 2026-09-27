import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Scope,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContext } from './tenant-context.service';

/**
 * Resuelve el tenant de la request y lo publica en el TenantContext.
 * Fuente de verdad: el JWT (contiene tenantId + userId + isSuperAdmin).
 * Header X-Tenant-Id se acepta SOLO para superadmin (impersonación controlada).
 *
 * Rutas whitelisted (públicas o cross-tenant): /auth/login, /health, /.
 *
 * `/auth/register` NO está aquí a propósito: ahora exige estar autenticado
 * (crea un usuario dentro del tenant de quien llama, ver AuthService.register),
 * así que necesita que TenantContext se resuelva igual que cualquier otra
 * ruta de negocio.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantInterceptor implements NestInterceptor {
  private static readonly PUBLIC_PATHS = ['/', '/health', '/auth/login', '/auth/refresh'];

  constructor(private readonly ctx: TenantContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const path: string = req.path || req.url || '';

    if (
      TenantInterceptor.PUBLIC_PATHS.some(
        (p) => path === p || path.startsWith(`${p}?`),
      )
    ) {
      return next.handle();
    }

    // req.user es poblado por JwtAuthGuard cuando aplica. Si no existe aquí es que la ruta
    // no está protegida y no debería resolver tenant — dejamos pasar sin contexto.
    const user = (
      req as {
        user?: { sub?: string; tenantId?: string; isSuperAdmin?: boolean };
      }
    ).user;
    if (!user) {
      return next.handle();
    }

    const isSuperAdmin = !!user.isSuperAdmin;
    let tenantId = user.tenantId ?? null;

    if (isSuperAdmin) {
      const impersonated = req.headers['x-tenant-id'];
      if (typeof impersonated === 'string' && impersonated.length > 0) {
        tenantId = impersonated;
      }
    } else if (!tenantId) {
      throw new UnauthorizedException('Token sin tenantId. Sesión inválida.');
    }

    this.ctx.setContext(tenantId, user.sub ?? null, isSuperAdmin);
    return next.handle();
  }
}
