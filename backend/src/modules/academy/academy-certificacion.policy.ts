import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthorizationDecision, AuthorizationPolicy, AuthorizationRequest } from '../security/authorization.types';
import { MODULOS_ACADEMY, moduloDeRuta } from './academy-catalogo';
import { ajustesDe } from './academy-ajustes';

/** Motivo de la denegación: el guard lo convierte en un mensaje que dice qué módulo aprobar. */
export const MOTIVO_ACADEMY = 'academy_pendiente';

const CACHE_MS = 30_000;

/**
 * Xmart Academy (Hernán, 23-oct): "los quizzes deben completarse y alcanzar el puntaje mínimo antes de tener acceso
 * transaccional". Política del motor de autorización: si el tenant exige certificación, una acción transaccional
 * (permiso `operar` de un módulo) se niega mientras la persona no apruebe el quiz de TODOS los módulos de su plan que
 * dan ese permiso (los que comparten permiso, como Comercial / Órdenes / Lista de Empaque / Reportes, van juntos).
 *
 * Solo actúa sobre permisos que la persona YA tiene por su perfil (si no lo tiene, RBAC lo niega igual). Consultar
 * nunca se bloquea. Superadmin y los exentos del tenant no se bloquean. Si algo falla al evaluar, no bloquea (el
 * motor sigue con RBAC): una falla de la Academy no puede tumbar la operación de Oben.
 */
@Injectable()
export class AcademyCertificacionPolicy implements AuthorizationPolicy {
  readonly name = 'academy-certificacion';
  private readonly logger = new Logger(AcademyCertificacionPolicy.name);
  private readonly ajustesCache = new Map<string, { valor: ReturnType<typeof ajustesDe>; hasta: number }>();
  private readonly permisosCache = new Map<string, { valor: Set<string>; hasta: number }>();

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async evaluate(request: AuthorizationRequest): Promise<AuthorizationDecision | null> {
    const { subject, permission } = request;
    if (subject.isSuperAdmin || !subject.tenantId) return null;
    const dan = MODULOS_ACADEMY.filter((m) => m.operar.includes(permission));
    if (dan.length === 0) return null;

    const ajustes = await this.ajustes(subject.tenantId);
    if (!ajustes.exigirCertificacion || ajustes.exentos.includes(subject.userId)) return null;

    const permisos = await this.permisos(subject.userId, subject.tenantId);
    if (!permisos.has(permission)) return null;
    const exigidos = dan.filter((m) => m.ver.every((p) => permisos.has(p)));
    if (exigidos.length === 0) return null;

    const aprobados = new Map(
      (
        await this.ds.query<Array<{ modulo: string; version_aprobada: number | null }>>(
          `SELECT modulo, version_aprobada FROM academy_progreso WHERE tenant_id = $1 AND user_id = $2 AND aprobado_at IS NOT NULL`,
          [subject.tenantId, subject.userId],
        )
      ).map((r) => [r.modulo, r.version_aprobada ?? 0]),
    );
    const pendientes = exigidos.filter((m) => (aprobados.get(m.key) ?? -1) < m.version);
    if (pendientes.length === 0) return null;

    const titulos = pendientes.map((m) => m.titulo);
    const ruta = request.context?.route ?? '';
    void this.ds
      .query(`INSERT INTO academy_eventos (tenant_id, user_id, modulo, tipo, detalle) VALUES ($1, $2, $3, 'bloqueo_academy', $4)`, [
        subject.tenantId,
        subject.userId,
        moduloDeRuta(ruta) ?? pendientes[0].key,
        JSON.stringify({ permiso: permission, ruta: ruta.slice(0, 200), pendientes: pendientes.map((m) => m.key) }),
      ])
      .catch(() => undefined);
    return {
      effect: 'deny',
      reason: MOTIVO_ACADEMY,
      metadata: {
        modulos: pendientes.map((m) => m.key),
        mensaje: `Para hacer esto debes aprobar en Xmart Academy: ${titulos.join(', ')} (puntaje mínimo ${ajustes.puntajeMinimo} %).`,
      },
    };
  }

  private async ajustes(tenantId: string) {
    const c = this.ajustesCache.get(tenantId);
    if (c && c.hasta > Date.now()) return c.valor;
    let valor = ajustesDe(null);
    try {
      const rows = await this.ds.query<Array<{ settings: Record<string, unknown> | null }>>(`SELECT settings FROM tenants WHERE id = $1`, [tenantId]);
      valor = ajustesDe(rows[0]?.settings);
    } catch (err) {
      this.logger.warn(`No se pudieron leer los ajustes de Academy: ${(err as Error).message}`);
    }
    this.ajustesCache.set(tenantId, { valor, hasta: Date.now() + CACHE_MS });
    return valor;
  }

  private async permisos(userId: string, tenantId: string): Promise<Set<string>> {
    const k = `${tenantId}:${userId}`;
    const c = this.permisosCache.get(k);
    if (c && c.hasta > Date.now()) return c.valor;
    const rows = await this.ds.query<Array<{ key: string }>>(
      `SELECT DISTINCT p.key FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         JOIN roles r ON r.id = rp.role_id
         JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = $1 AND ur.tenant_id = $2 AND r.is_active = true AND p.is_platform = false`,
      [userId, tenantId],
    );
    const valor = new Set(rows.map((r) => r.key));
    this.permisosCache.set(k, { valor, hasta: Date.now() + CACHE_MS });
    return valor;
  }
}
