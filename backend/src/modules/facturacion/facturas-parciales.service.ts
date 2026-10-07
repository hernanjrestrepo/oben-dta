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

/** Rechazos de Oben que significan "esta factura YA existe": la proforma figura Facturada o sus artículos ya se cerraron. */
const YA_FACTURADA = /NO SE ENCUENTRA EN LA ORDEN DE VENTA|se encuentra en estado:\s*Facturada/i;

/** true solo si Oben confirma el éxito: `isSuccessful` verdadero o `Code` 200 (mayúsculas/minúsculas y texto/número indistintos). */
export function confirmaExito(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const o = Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k.toLowerCase(), v]));
  const ok = String(o.issuccessful ?? '').toLowerCase() === 'true';
  const code = String(o.code ?? '').trim() === '200';
  return ok || code;
}

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
  /** Espera antes de la llamada de verificación (las pruebas la ponen en 0). */
  esperaVerificacionMs = 3_000;

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
  async facturar(id: string, confirmoQueNoExiste = false, mercadoConfirmado = false): Promise<FacturaParcial> {
    const tenantId = this.ctx.tenantId;
    const fila = await this.repo.findOne({ where: { id, tenantId } });
    if (!fila) throw new NotFoundException('Solicitud de factura parcial no encontrada.');
    if (fila.estado === 'facturada') return fila;
    // Solo pedidos NACIONALES (Hernán, 7-oct): exportación todavía no está en vivo en Oben. Si no se puede
    // confirmar que la PF es nacional, tampoco se factura (ante la duda, no se crea una factura fiscal).
    const mercado = mercadoConfirmado ? 'nacional' : await this.mercadoDe(fila.numberPF);
    if (mercado !== 'nacional') {
      const motivo =
        mercado === 'exportacion'
          ? `La PF ${fila.numberPF} es de EXPORTACIÓN: por ahora solo se facturan pedidos nacionales (Colombia).`
          : `No se pudo confirmar que la PF ${fila.numberPF} sea nacional (no aparece en el listado de proformas de Oben): no se factura.`;
      await this.repo.update({ id, tenantId }, { error: motivo });
      throw new BadRequestException(motivo);
    }
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

    const pedir = () =>
      this.hub.call<unknown>('obenCostOrder', 'factura.crear', { numberPF: fila.numberPF, numberDistribucion: fila.numeroDistribucion }, { maxAttempts: 1, timeoutMs: 90_000 });
    let r = await pedir();
    // Oben contesta un rechazo de negocio con HTTP 200+isSuccessful=false o con HTTP 4xx (visto el 2026-10-06: 400 "No se pudo crear la factura de venta"): en ambos casos NO se creó nada y es seguro reintentar.
    const esRechazo = (x: typeof r) => !x.ok && /^(Oben rechazó la operación|HTTP 4\d\d:)/.test(x.error ?? '');
    const esErrorCliente = (x: typeof r) => !x.ok && /BUSINESS_ERROR|pending_credentials|ssrf_blocked/.test(x.error ?? '');
    // Éxito = confirmación EXPLÍCITA de Oben (isSuccessful true o Code 200).
    const esExito = (x: typeof r) => x.ok && confirmaExito(x.data);
    let yaFacturada = !r.ok && YA_FACTURADA.test(r.error ?? '');
    // Visto el 2026-10-07: Oben a veces FACTURA y aun así responde {"message":"An error has occurred."} o se demora
    // más del tiempo de espera. Como Oben cierra los artículos al facturar, repetir la llamada es seguro: si ya
    // estaba facturada la rechaza ("el artículo X no se encuentra en la orden de venta"); si no, la crea.
    let verificada = false;
    if (!esExito(r) && !yaFacturada && !esErrorCliente(r) && (r.ok || !esRechazo(r))) {
      await new Promise((res) => setTimeout(res, this.esperaVerificacionMs));
      r = await pedir();
      verificada = true;
      yaFacturada = !r.ok && YA_FACTURADA.test(r.error ?? '');
    }
    const rechazo = esRechazo(r);
    const errorCliente = esErrorCliente(r);
    const confirmada = esExito(r) || yaFacturada;
    const estado: EstadoFacturaParcial = confirmada ? 'facturada' : r.ok || (!rechazo && !errorCliente) ? 'revisar' : 'rechazada';
    const errorTexto = confirmada
      ? null
      : r.ok
        ? `Respuesta de Oben sin confirmación de éxito (${JSON.stringify(r.data ?? null).slice(0, 160)}). Verificar en OBEN MAS si la factura existe antes de reintentar.`
        : (r.error ?? 'Error desconocido');
    await this.repo.update(
      { id, tenantId },
      {
        estado,
        respuesta: (r.ok ? r.data : yaFacturada ? { yaFacturada: true, verificada, detalle: r.error } : null) as never,
        error: errorTexto,
        modo: r.mode ?? null,
        facturadoPor: this.ctx.userId ?? null,
        facturadaAt: confirmada ? new Date() : null,
      },
    );
    await this.audit.log({
      workflowName: 'facturacion',
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: confirmada ? 'factura_parcial_creada' : 'factura_parcial_fallida',
      entityType: 'proforma',
      entityId: fila.numberPF,
      actorId: this.ctx.userId,
      inputData: { numberPF: fila.numberPF, numeroDistribucion: fila.numeroDistribucion, origen: fila.origen },
      outputData: { ok: confirmada, estado, modo: r.mode ?? null, respuesta: r.ok ? r.data : null },
      reason: errorTexto,
    });
    this.logger.log(`PF ${fila.numberPF} distribución ${fila.numeroDistribucion}: ${estado}${errorTexto ? ` — ${errorTexto}` : ''}`);
    return (await this.repo.findOne({ where: { id, tenantId } }))!;
  }

  /**
   * Mercado de la PF. El listado de Oben (spCheckSalesOrderComex_Paradixe) es de COMEX: trae las de exportación y
   * normalmente NO trae las nacionales. Si la PF no aparece, se mira de qué país es su orden (spCheckSettlement →
   * orden de venta → Lista de Empaque): Colombia = nacional. Sin certeza, null (y no se factura).
   */
  private async mercadoDe(pf: string): Promise<'nacional' | 'exportacion' | null> {
    const opts = { maxAttempts: 2, timeoutMs: 60_000 };
    const r = await this.hub.call<unknown>('obenCostOrder', 'query.run', { procedure: 'spCheckSalesOrderComex_Paradixe', numberOrderSales: Number(pf) }, opts);
    const lista = r.ok && Array.isArray(r.data) ? (r.data as Array<Record<string, unknown>>) : [];
    const e = lista.find((x) => String(x.NroProforma ?? '').trim() === pf);
    const m = String(e?.Mercado ?? '').trim().toUpperCase();
    if (m.startsWith('EXPORT')) return 'exportacion';
    if (m.startsWith('NAC')) return 'nacional';
    const c = await this.hub.call<unknown>('obenCostOrder', 'liquidacion.consultar', { numberPF: pf }, opts);
    const d = c.ok ? (Array.isArray(c.data) ? (c.data as unknown[])[0] : c.data) : null;
    const ov = Number((d as Record<string, unknown> | null)?.OrdenVenta);
    if (!Number.isInteger(ov) || ov <= 0) return null;
    const pais = (await this.encabezadoDeOv(ov))?.pais ?? '';
    if (!pais) return null;
    return /^col(ombia)?\b/i.test(pais) ? 'nacional' : 'exportacion';
  }

  private async encabezadoDeOv(ov: number): Promise<{ pais: string; proforma: string } | null> {
    const r = await this.hub.call<unknown>('obenCostOrder', 'query.run', { procedure: 'spEmpaqueUnificada_Paradixe', numberOrderSales: ov }, { maxAttempts: 2, timeoutMs: 60_000 });
    const h = r.ok ? (Array.isArray(r.data) ? (r.data as unknown[])[0] : r.data) : null;
    if (!h || typeof h !== 'object') return null;
    const o = h as Record<string, unknown>;
    return { pais: String(o.Pais ?? '').trim(), proforma: String(o.Proforma ?? '').trim() };
  }

  /**
   * Factura AUTOMÁTICA de un pedido nacional completo (Hernán, 7-oct: "eso tiene que ser automático"): se llama
   * cuando termina de enviarse la Lista de Empaque de la OV. Solo Colombia; exportación no se factura. Una factura
   * por PF (NumberDistribucion vacío = pedido completo, según José). Si la PF ya tiene una solicitud (parcial por
   * correo, manual o automática) no se vuelve a pedir. Apagable con settings.facturacion.nacionalAutomatica=false.
   */
  async facturarOvNacional(numberOrderSales: number): Promise<{ estado: string; motivo?: string; numberPF?: string }> {
    const tenantId = this.ctx.tenantId;
    const omitir = async (motivo: string, pf?: string) => {
      await this.audit.log({
        workflowName: 'facturacion',
        eventType: WorkflowEventType.ACTION_EXECUTED,
        action: 'factura_automatica_omitida',
        entityType: 'orden_venta',
        entityId: String(numberOrderSales),
        actorId: this.ctx.userId,
        outputData: { numberPF: pf ?? null },
        reason: motivo,
      });
      this.logger.log(`OV ${numberOrderSales}: factura automática omitida — ${motivo}`);
      return { estado: 'omitida', motivo, numberPF: pf };
    };
    if (!(await this.nacionalAutomatica())) return omitir('La factura automática de pedidos nacionales está apagada.');
    const h = await this.encabezadoDeOv(numberOrderSales);
    if (!h?.proforma) return omitir('Oben no devolvió la proforma de la orden.');
    if (!/^col(ombia)?\b/i.test(h.pais)) {
      return omitir(`La orden es de ${h.pais || 'país desconocido'}: solo se facturan pedidos nacionales (Colombia).`, h.proforma);
    }
    const previa = await this.repo.find({ where: { tenantId, numberPF: h.proforma } });
    if (previa.length > 0) return omitir(`La PF ${h.proforma} ya tiene una solicitud de factura (${previa.map((p) => p.estado).join(', ')}).`, h.proforma);
    let fila: FacturaParcial;
    try {
      fila = await this.repo.save(
        this.repo.create({
          tenantId,
          numberPF: h.proforma,
          numeroDistribucion: '',
          origen: 'automatico',
          remitente: `OV ${numberOrderSales}`,
          estado: 'pendiente',
          solicitadoPor: this.ctx.userId ?? null,
        }),
      );
    } catch {
      return omitir(`La PF ${h.proforma} ya tiene una solicitud de factura.`, h.proforma); // carrera: otra ejecución la registró primero
    }
    const r = await this.facturar(fila.id, false, true);
    return { estado: r.estado, numberPF: h.proforma };
  }

  private async nacionalAutomatica(): Promise<boolean> {
    try {
      const t = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
      const f = (t?.settings?.facturacion ?? {}) as Record<string, unknown>;
      return f.nacionalAutomatica !== false;
    } catch {
      return true;
    }
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
