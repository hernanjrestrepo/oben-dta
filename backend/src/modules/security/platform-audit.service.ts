import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditQueryDto } from './dto/security.dto';

export interface AuditRow {
  id: string;
  tenantId: string | null;
  userId: string | null;
  permissionKey: string | null;
  moduleKey: string | null;
  route: string | null;
  method: string | null;
  ip: string | null;
  userAgent: string | null;
  granted: boolean;
  deniedReason: string | null;
  requestId: string | null;
  createdAt: Date;
}

/**
 * Consulta de solo-lectura sobre authorization_audit (append-only, escrito por
 * AuthorizationService). No usa TypeORM entity porque la tabla nunca se
 * modifica desde código, solo se lee — SQL directo con filtros dinámicos
 * seguros por parámetros posicionales.
 */
@Injectable()
export class PlatformAuditService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async query(dto: AuditQueryDto): Promise<{ total: number; page: number; pageSize: number; items: AuditRow[] }> {
    const page = Math.max(1, parseInt(dto.page ?? '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(dto.pageSize ?? '50', 10) || 50));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const push = (clause: string, value: unknown) => {
      params.push(value);
      conditions.push(clause.replace('?', `$${params.length}`));
    };

    if (dto.tenantId) push('tenant_id = ?', dto.tenantId);
    if (dto.userId) push('user_id = ?', dto.userId);
    if (dto.permissionKey) push('permission_key = ?', dto.permissionKey);
    if (dto.granted === 'true' || dto.granted === 'false') push('granted = ?', dto.granted === 'true');
    if (dto.from) push('created_at >= ?', new Date(dto.from));
    if (dto.to) push('created_at <= ?', new Date(dto.to));

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalRows = await this.ds.query(
      `SELECT COUNT(*)::int AS count FROM authorization_audit ${where}`,
      params,
    );
    const total = totalRows[0]?.count ?? 0;

    const rows = await this.ds.query(
      `
      SELECT id, tenant_id, user_id, permission_key, module_key, route, method,
             ip, user_agent, granted, denied_reason, request_id, created_at
      FROM authorization_audit
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, pageSize, offset],
    );

    return {
      total,
      page,
      pageSize,
      items: rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        tenantId: r.tenant_id as string | null,
        userId: r.user_id as string | null,
        permissionKey: r.permission_key as string | null,
        moduleKey: r.module_key as string | null,
        route: r.route as string | null,
        method: r.method as string | null,
        ip: r.ip as string | null,
        userAgent: r.user_agent as string | null,
        granted: r.granted as boolean,
        deniedReason: r.denied_reason as string | null,
        requestId: r.request_id as string | null,
        createdAt: r.created_at as Date,
      })),
    };
  }
}
