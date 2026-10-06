import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FacturaParcial, EstadoFacturaParcial } from '../../entities/factura-parcial.entity';
import { Tenant } from '../../entities/tenant.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';

/**
 * Formato REAL del correo de Oben (leído del buzón el 2026-10-01, ejemplo
 * que José mandó en la reunión):
 *   De: "Sistemas" <notif.app.co@obengroup.com>
 *   Asunto: "Proforma 10770 - Facturar Parcial"
 *   Cuerpo: "Numero de Proforma: 10770 - Numero de Distribucion: 11023"
 */
const ASUNTO_RE = /^\s*(?:(?:RE|RV|FW|FWD)\s*:\s*)*Proforma\s+(\d+)\s*-\s*Facturar\s+Parcial\b/i;
const CUERPO_RE = /N[uú]mero\s+de\s+Proforma\s*:\s*(\d+)[\s\S]*?N[uú]mero\s+de\s+Distribuci[oó]n\s*:\s*(\d+)/i;
/** Solo correos internos de Oben pueden pedir una factura. */
const DOMINIO_OBEN = 'obengroup.com';

export interface SolicitudParcial {
  numberPF: string;
  numeroDistribucion: string;
}

/** null si no es el correo de factura parcial. Lanza si lo es pero viene incompleto o inconsistente (nunca adivina). */
export function parsearCorreoFacturaParcial(asunto: string, cuerpo: string): SolicitudParcial | null {
  const a = asunto.match(ASUNTO_RE);
  if (!a) return null;
  const c = cuerpo.match(CUERPO_RE);
  if (!c) throw new BadRequestException(`El correo "${asunto}" no trae "Numero de Proforma: ... - Numero de Distribucion: ..." en el cuerpo.`);
  if (c[1] !== a[1]) {
    throw new BadRequestException(`El asunto dice Proforma ${a[1]} pero el cuerpo dice ${c[1]}: no se registra.`);
  }
  return { numberPF: a[1], numeroDistribucion: c[2] };
}

/**
 * Facturas parciales (WO-023, reunión 2026-10-01 53:28–57:24 y 1:30:20):
 * Distribución "cierra parcial" → llega el correo → se registra la solicitud
 * → se factura en OBEN MAS con `APICrearInvoiceParadixe` (NumberPF +
 * NumberDistribucion). También se puede digitar a mano (plan B y primera
 * prueba, porque el OBEN de pruebas tiene los correos desactivados).
 *
 * Facturar automáticamente al llegar el correo solo si
 * `settings.facturacion.parcialAutomatica === true` (por defecto se registra
 * y espera el clic, hasta validar la primera factura con José).
 */
@Injectable()
export class FacturasParcialesService {
  private readonly logger = new Logger(FacturasParcialesService.name);

  constructor(
    @InjectRepository(FacturaParcial) private readonly repo: Repository<FacturaParcial>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly ctx: TenantContext,
    private readonly hub: IntegrationHubService,
    private readonly audit: WorkflowAuditService,
  ) {}

  listar(limite = 50): Promise<FacturaParcial[]> {
    return this.repo.find({ where: { tenantId: this.ctx.tenantId }, order: { createdAt: 'DESC' }, take: Math.min(Math.max(limite, 1), 200) });
  }

  async registrarDesdeCorreo(input: { from: string; subject: string; body: string; messageId: string }): Promise<FacturaParcial> {
    const solicitud = parsearCorreoFacturaParcial(input.subject, input.body);
    if (!solicitud) throw new BadRequestException('No es un correo de factura parcial.');
    const dominio = (input.from.split('@')[1] ?? '').toLowerCase();
    if (dominio !== DOMINIO_OBEN) {
      throw new BadRequestException(`Solo un correo de @${DOMINIO_OBEN} puede pedir una factura (llegó de "${input.from}").`);
    }
    const fila = await this.registrar(solicitud, 'correo', { messageId: input.messageId, remitente: input.from });
    if (fila.estado === 'pendiente' && (await this.automatica())) {
      return this.facturar(fila.id);
    }
    return fila;
  }

  registrarManual(numberPF: string, numeroDistribucion: string): Promise<FacturaParcial> {
    if (!/^\d+$/.test(numberPF) || !/^\d+$/.test(numeroDistribucion)) {
      throw new BadRequestException('Proforma y número de distribución deben ser numéricos.');
    }
    return this.registrar({ numberPF, numeroDistribucion }, 'manual', {});
  }

  /**
   * Factura una solicitud. Solo desde 'pendiente' o 'rechazada' (Oben dijo
   * que no: seguro reintentar). 'revisar' (no se sabe si Oben facturó) exige
   * `confirmoQueNoExiste` — reintentar a ciegas podría duplicar la factura.
   */
  async facturar(id: string, confirmoQueNoExiste = false): Promise<FacturaParcial> {
    const tenantId = this.ctx.tenantId;
    const fila = await this.repo.findOne({ where: { id, tenantId } });
    if (!fila) throw new NotFoundException('Solicitud de factura parcial no encontrada.');
    if (fila.estado === 'facturada') return fila;
    const desde: EstadoFacturaParcial[] = confirmoQueNoExiste ? ['pendiente', 'rechazada', 'revisar'] : ['pendiente', 'rechazada'];
    if (!desde.includes(fila.estado)) {
      throw new ConflictException(
        fila.estado === 'revisar'
          ? 'No se sabe si Oben alcanzó a facturar esta solicitud: verifícalo en OBEN MAS y confirma antes de reintentar.'
          : `La solicitud está "${fila.estado}".`,
      );
    }
    // Reclamo atómico: dos clics (o el correo y un clic) no facturan dos veces.
    const claim = await this.repo.update({ id, tenantId, estado: In(desde) }, { estado: 'facturando', error: null });
    if (!claim.affected) throw new ConflictException('Otra persona está facturando esta solicitud en este momento.');

    const r = await this.hub.call<unknown>(
      'obenCostOrder',
      'factura.crear',
      { numberPF: fila.numberPF, numberDistribucion: fila.numeroDistribucion },
      { maxAttempts: 1, timeoutMs: 60_000 },
    );
    // Oben contesta un rechazo de negocio con HTTP 200+isSuccessful=false o con HTTP 4xx (visto el 2026-10-06: 400 "No se pudo crear la factura de venta"): en ambos casos NO se creó nada y es seguro reintentar.
    const rechazo = !r.ok && /^(Oben rechazó la operación|HTTP 4\d\d:)/.test(r.error ?? '');
    const errorCliente = !r.ok && /BUSINESS_ERROR|pending_credentials|ssrf_blocked/.test(r.error ?? '');
    const estado: EstadoFacturaParcial = r.ok ? 'facturada' : rechazo || errorCliente ? 'rechazada' : 'revisar';
    await this.repo.update(
      { id, tenantId },
      {
        estado,
        respuesta: (r.ok ? r.data : null) as never,
        error: r.ok ? null : (r.error ?? 'Error desconocido'),
        modo: r.mode ?? null,
        facturadoPor: this.ctx.userId ?? null,
        facturadaAt: r.ok ? new Date() : null,
      },
    );
    await this.audit.log({
      workflowName: 'facturacion',
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: r.ok ? 'factura_parcial_creada' : 'factura_parcial_fallida',
      entityType: 'proforma',
      entityId: fila.numberPF,
      actorId: this.ctx.userId,
      inputData: { numberPF: fila.numberPF, numeroDistribucion: fila.numeroDistribucion, origen: fila.origen },
      outputData: { ok: r.ok, estado, modo: r.mode ?? null, respuesta: r.ok ? r.data : null },
      reason: r.ok ? null : r.error,
    });
    this.logger.log(`PF ${fila.numberPF} distribución ${fila.numeroDistribucion}: ${estado}${r.ok ? '' : ` — ${r.error}`}`);
    return (await this.repo.findOne({ where: { id, tenantId } }))!;
  }

  private async registrar(
    s: SolicitudParcial,
    origen: 'correo' | 'manual',
    extra: { messageId?: string; remitente?: string },
  ): Promise<FacturaParcial> {
    const tenantId = this.ctx.tenantId;
    const existente = await this.repo.findOne({ where: { tenantId, numberPF: s.numberPF, numeroDistribucion: s.numeroDistribucion } });
    if (existente) return existente; // el mismo parcial dos veces = una sola factura
    const fila = await this.repo.save(
      this.repo.create({
        tenantId,
        numberPF: s.numberPF,
        numeroDistribucion: s.numeroDistribucion,
        origen,
        messageId: extra.messageId ?? null,
        remitente: extra.remitente ?? null,
        estado: 'pendiente',
        solicitadoPor: this.ctx.userId ?? null,
      }),
    );
    await this.audit.log({
      workflowName: 'facturacion',
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: 'factura_parcial_registrada',
      entityType: 'proforma',
      entityId: s.numberPF,
      actorId: this.ctx.userId,
      inputData: { ...s, origen, remitente: extra.remitente ?? null },
      outputData: { id: fila.id },
    });
    return fila;
  }

  private async automatica(): Promise<boolean> {
    try {
      const t = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
      const f = (t?.settings?.facturacion ?? {}) as Record<string, unknown>;
      return f.parcialAutomatica === true;
    } catch {
      return false;
    }
  }
}
