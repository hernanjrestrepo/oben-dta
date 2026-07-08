import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface SystemStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  database: { status: 'ok' | 'error'; migrationsApplied: number };
  tenants: Record<string, number> & { total: number };
  subscriptions: Record<string, number> & { total: number };
  platformUsers: { total: number; active: number; superAdmins: number };
}

/**
 * Resumen administrativo para el panel SuperAdmin (conteos, no métricas de
 * infraestructura). El dashboard de observabilidad completo (Redis, IA,
 * Integration Hub, tracing) es la Sección 7 de la misión — esto cubre
 * únicamente lo que el panel de plataforma necesita mostrar hoy.
 */
@Injectable()
export class PlatformSystemStatusService {
  private readonly logger = new Logger(PlatformSystemStatusService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async get(): Promise<SystemStatus> {
    let dbOk = true;
    let migrationsApplied = 0;
    try {
      await this.ds.query('SELECT 1');
      const rows = await this.ds.query('SELECT COUNT(*)::int AS count FROM schema_migrations');
      migrationsApplied = rows[0]?.count ?? 0;
    } catch (e) {
      dbOk = false;
      this.logger.error('system-status db check failed', (e as Error).message);
    }

    const tenants = dbOk ? await this.countByColumn('tenants', 'status') : { total: 0 };
    const subscriptions = dbOk ? await this.countByColumn('tenant_subscriptions', 'status') : { total: 0 };

    let platformUsers = { total: 0, active: 0, superAdmins: 0 };
    if (dbOk) {
      const rows = await this.ds.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE "isActive")::int AS active,
                COUNT(*) FILTER (WHERE is_super_admin)::int AS super_admins
         FROM users WHERE tenant_id IS NULL`,
      );
      platformUsers = {
        total: rows[0]?.total ?? 0,
        active: rows[0]?.active ?? 0,
        superAdmins: rows[0]?.super_admins ?? 0,
      };
    }

    return {
      status: dbOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database: { status: dbOk ? 'ok' : 'error', migrationsApplied },
      tenants: tenants as Record<string, number> & { total: number },
      subscriptions: subscriptions as Record<string, number> & { total: number },
      platformUsers,
    };
  }

  private async countByColumn(table: string, column: string): Promise<Record<string, number> & { total: number }> {
    const rows = await this.ds.query(`SELECT ${column} AS key, COUNT(*)::int AS count FROM ${table} GROUP BY ${column}`);
    const out: Record<string, number> = { total: 0 };
    for (const r of rows as Array<{ key: string; count: number }>) {
      out[r.key] = r.count;
      out.total += r.count;
    }
    return out as Record<string, number> & { total: number };
  }
}
