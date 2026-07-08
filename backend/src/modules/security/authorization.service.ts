import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LicenseService } from './license.service';
import { LicensingService } from './licensing.service';
import {
  AuthorizationDecision,
  AuthorizationPolicy,
  AuthorizationRequest,
  AuthorizationSubject,
} from './authorization.types';

export const AUTHORIZATION_POLICIES = Symbol('AUTHORIZATION_POLICIES');

/**
 * Motor central de autorización.
 *
 * Orden de evaluación:
 *  1. Sanidad: subject autenticado.
 *  2. Bypass superadmin: si el permiso es de plataforma y el usuario tiene el
 *     platform role adecuado, allow.
 *  3. Policies pluggables (ABAC futuro): cada policy puede devolver allow/deny/null.
 *     - Si alguna devuelve deny, gana (deny > allow).
 *     - Si alguna devuelve allow, se acepta.
 *     - Si todas devuelven null, se cae al modelo RBAC.
 *  4. RBAC + licencia (default):
 *     - Permiso platform → requiere platform role con ese permiso.
 *     - Permiso de tenant → requiere:
 *       a. tenant activo
 *       b. módulo del permiso habilitado por licencia + feature flags
 *       c. usuario con al menos un rol que agrupe ese permiso
 *
 * Cache: por request, en TenantContext (no aquí — para no acoplar).
 * Auditoría: cada evaluate() escribe una fila en authorization_audit (fire-and-forget).
 */
@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger(AuthorizationService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly licenses: LicenseService,
    private readonly licensing: LicensingService,
    @Optional()
    @Inject(AUTHORIZATION_POLICIES)
    private readonly policies: AuthorizationPolicy[] = [],
  ) {}

  async can(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const decision = await this.evaluate(request);
    // Audit fire-and-forget para no bloquear la respuesta.
    this.auditDecision(request, decision).catch((e) =>
      this.logger.error('audit write failed', (e as Error).message),
    );
    return decision;
  }

  private async evaluate(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const { subject, permission } = request;

    if (!subject?.userId) {
      return { effect: 'deny', reason: 'no_subject', matchedPolicy: 'sanity' };
    }
    if (!permission) {
      return { effect: 'deny', reason: 'no_permission', matchedPolicy: 'sanity' };
    }

    // (1) Es permiso de plataforma → resolver por platform_user_roles.
    const permissionRow = await this.ds.query(
      `SELECT is_platform, module_key FROM permissions WHERE key = $1 LIMIT 1`,
      [permission],
    );
    if (permissionRow.length === 0) {
      return { effect: 'deny', reason: 'permission_not_registered', matchedPolicy: 'rbac' };
    }
    const isPlatformPermission = permissionRow[0].is_platform as boolean;
    const moduleKey = permissionRow[0].module_key as string;

    if (isPlatformPermission) {
      const hasPlatform = await this.userHasPlatformPermission(subject.userId, permission);
      if (hasPlatform) {
        return { effect: 'allow', reason: 'platform_role_grant', matchedPolicy: 'rbac.platform' };
      }
      return { effect: 'deny', reason: 'missing_platform_role', matchedPolicy: 'rbac.platform' };
    }

    // (2) Policies pluggables — ABAC futuro. Deny gana; si nadie decide, sigue a RBAC.
    let hadAllow = false;
    for (const policy of this.policies) {
      try {
        const d = await policy.evaluate(request);
        if (!d) continue;
        if (d.effect === 'deny') {
          return { ...d, matchedPolicy: `policy:${policy.name}` };
        }
        if (d.effect === 'allow') hadAllow = true;
      } catch (e) {
        this.logger.warn(`policy ${policy.name} failed: ${(e as Error).message}`);
      }
    }

    // (3) RBAC + licencia por tenant.
    const tenantId = subject.tenantId;
    if (!tenantId) {
      // Un usuario sin tenant no puede tener permisos de tenant salvo que sea superadmin
      // impersonando (en cuyo caso subject.tenantId ya vendría seteado por el interceptor).
      return { effect: 'deny', reason: 'no_tenant_in_subject', matchedPolicy: 'rbac.tenant' };
    }

    const commercialLicense = await this.licensing.validate(tenantId);
    if (!commercialLicense.valid) {
      return {
        effect: 'deny',
        reason: `license_${commercialLicense.reason}`,
        matchedPolicy: 'license.commercial',
        metadata: { moduleKey },
      };
    }

    const moduleEnabled = await this.licenses.isModuleEnabled(tenantId, moduleKey);
    if (!moduleEnabled) {
      return {
        effect: 'deny',
        reason: 'module_not_licensed',
        matchedPolicy: 'license',
        metadata: { moduleKey },
      };
    }

    const hasRolePermission = await this.userHasTenantPermission(
      subject.userId,
      tenantId,
      permission,
    );

    if (hasRolePermission) {
      return { effect: 'allow', reason: 'role_grant', matchedPolicy: 'rbac.tenant' };
    }

    if (hadAllow) {
      // Policy pluggable dio allow y no hay deny. Usamos ese resultado.
      return { effect: 'allow', reason: 'policy_grant', matchedPolicy: 'policy' };
    }

    return { effect: 'deny', reason: 'no_matching_role', matchedPolicy: 'rbac.tenant' };
  }

  async listPermissions(subject: AuthorizationSubject): Promise<string[]> {
    if (!subject.userId) return [];
    const rows = await this.ds.query(
      `
      SELECT DISTINCT p.key
      FROM permissions p
      JOIN role_permissions rp ON rp.permission_id = p.id
      JOIN roles r ON r.id = rp.role_id
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1
        AND ur.tenant_id = $2
        AND r.is_active = true
        AND p.is_platform = false

      UNION

      SELECT DISTINCT p.key
      FROM permissions p
      JOIN platform_role_permissions prp ON prp.permission_id = p.id
      JOIN platform_roles pr ON pr.id = prp.platform_role_id
      JOIN platform_user_roles pur ON pur.platform_role_id = pr.id
      WHERE pur.user_id = $1
        AND p.is_platform = true
      `,
      [subject.userId, subject.tenantId],
    );
    return rows.map((r: { key: string }) => r.key);
  }

  private async userHasPlatformPermission(
    userId: string,
    permissionKey: string,
  ): Promise<boolean> {
    const rows = await this.ds.query(
      `
      SELECT 1
      FROM platform_user_roles pur
      JOIN platform_role_permissions prp ON prp.platform_role_id = pur.platform_role_id
      JOIN permissions p ON p.id = prp.permission_id
      WHERE pur.user_id = $1 AND p.key = $2
      LIMIT 1
      `,
      [userId, permissionKey],
    );
    return rows.length > 0;
  }

  private async userHasTenantPermission(
    userId: string,
    tenantId: string,
    permissionKey: string,
  ): Promise<boolean> {
    const rows = await this.ds.query(
      `
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1
        AND ur.tenant_id = $2
        AND p.key = $3
        AND r.is_active = true
      LIMIT 1
      `,
      [userId, tenantId, permissionKey],
    );
    return rows.length > 0;
  }

  private async auditDecision(
    request: AuthorizationRequest,
    decision: AuthorizationDecision,
  ): Promise<void> {
    const { subject, permission, context } = request;
    await this.ds.query(
      `
      INSERT INTO authorization_audit
        (tenant_id, user_id, permission_key, module_key, route, method, ip, user_agent, granted, denied_reason, request_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        subject.tenantId,
        subject.userId,
        permission,
        this.extractModuleKey(permission),
        context?.route ?? null,
        context?.method ?? null,
        context?.ip ?? null,
        context?.userAgent ?? null,
        decision.effect === 'allow',
        decision.effect === 'deny' ? decision.reason : null,
        context?.requestId ?? null,
      ],
    );
  }

  private extractModuleKey(permissionKey: string): string {
    const idx = permissionKey.indexOf('.');
    return idx > 0 ? permissionKey.slice(0, idx) : permissionKey;
  }
}
