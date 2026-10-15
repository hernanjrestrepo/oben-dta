import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { FacturaParcial, EstadoFacturaParcial } from '../../entities/factura-parcial.entity';
import { FacturaProgramada, TipoFacturaProgramada } from '../../entities/factura-programada.entity';
import { Tenant } from '../../entities/tenant.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';

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
/** Oben no la rechaza: la proforma aún espera una aprobación interna suya. Se reintenta sola. */
const EN_ESPERA_OBEN = /se encuentra en estado:\s*Aprobaci[oó]n pendiente/i;
/** Al crear la factura Oben contesta Code 200 y un número en `message` (p. ej. 9089336). */
export function numeroDeRespuesta(data: unknown): string | null {
  const m = data && typeof data === 'object' ? String((data as Record<string, unknown>).message ?? (data as Record<string, unknown>).Message ?? '').trim() : '';
  return /^\d{4,}$/.test(m) ? m : null;
}
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

/** Una orden del cuadro diario de Oben ("esto es lo que se va a facturar hoy"). */
export interface OrdenProgramada {
  ov: number;
  pf: string;
  tipo?: TipoFacturaProgramada;
  estadoOben?: string;
  cliente?: string;
}

export interface ResultadoProgramada {
  ov: number;
  pf: string;
  tipo: TipoFacturaProgramada;
  /** facturada | rechazada | revisar | omitida | espera_cierre | varias | error */
  resultado: string;
  detalle?: string;
}

const HORA_CORTE_POR_DEFECTO = '16:00';
/** Un correo "Facturar Parcial" y el cierre de su orden pueden llegar en cualquier orden, con minutos de diferencia. */
const TOLERANCIA_CIERRE_MS = 30 * 60_000;

/** Fecha (AAAA-MM-DD) y minutos del día en Bogotá: UTC−5 fijo, Colombia no cambia la hora. */
export function fechaHoraBogota(d: Date): { fecha: string; minutos: number } {
  const b = new Date(d.getTime() - 5 * 3_600_000);
  return { fecha: b.toISOString().slice(0, 10), minutos: b.getUTCHours() * 60 + b.getUTCMinutes() };
}

function minutosDe(hora: unknown): number | null {
  const m = typeof hora === 'string' ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hora.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const hhmm = (minutos: number) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

const noProgramada = (fecha: string) => `No está en la programación de facturación de hoy (${fecha}): se factura cuando Oben la programe.`;

/**
 * Corte de facturación: lo que cierra HOY a la hora de corte o después no se factura hoy ("si corte cierra una OV a
 * las 4:05 p. m. queda para el día siguiente", Jorge, 8-oct). Lo cerrado en días anteriores sí. null = se puede.
 */
function motivoDeCorte(cierre: Date, fechaHoy: string, corte: number): string | null {
  const c = fechaHoraBogota(cierre);
  if (c.fecha !== fechaHoy || c.minutos < corte) return null;
  return `Cerró a las ${hhmm(c.minutos)}, después del corte de las ${hhmm(corte)}: no se factura hoy; queda para cuando Oben la reprograme.`;
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
  /** Reloj (las pruebas lo fijan para probar el corte de las 4 p. m.). */
  reloj: () => Date = () => new Date();

  constructor(
    @InjectRepository(FacturaParcial) private readonly repo: Repository<FacturaParcial>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly ctx: TenantContext,
    private readonly hub: IntegrationHubService,
    private readonly audit: WorkflowAuditService,
    @Optional() private readonly distributionLists?: DistributionListsService,
    @Optional() @InjectRepository(FacturaProgramada) private readonly programadas?: Repository<FacturaProgramada>,
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
      // Programación diaria (WO-032) + José (13-oct): un PARCIAL se factura apenas llega el correo "Facturar Parcial"
      // (el pedido ya está montado y cargado esperando la factura): no espera cierre ni Lista de Empaque. Solo se
      // exige que Oben lo haya programado para hoy en el cuadro del día.
      const prog = await this.programadaHoy({ pf: fila.numberPF });
      if (prog.activa && !prog.entrada) {
        const espera = noProgramada(prog.fecha);
        await this.repo.update({ id: fila.id, tenantId: this.ctx.tenantId }, { error: espera });
        this.logger.log(`PF ${fila.numberPF} distribución ${fila.numeroDistribucion}: queda pendiente — ${espera}`);
        return (await this.repo.findOne({ where: { id: fila.id, tenantId: this.ctx.tenantId } })) ?? fila;
      }
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
    // Interruptor general (Hernán, 7-oct: "suspendida la facturación hasta nueva orden"): no se pide NINGUNA factura a Oben.
    if (await this.suspendida()) {
      throw new ConflictException('La facturación está suspendida hasta nueva orden: no se envía ninguna factura a Oben.');
    }
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
    const desde: EstadoFacturaParcial[] = confirmoQueNoExiste ? ['pendiente', 'rechazada', 'en_espera', 'revisar'] : ['pendiente', 'rechazada', 'en_espera'];
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
    const enEspera = !confirmada && !r.ok && EN_ESPERA_OBEN.test(r.error ?? '');
    const estado: EstadoFacturaParcial = confirmada ? 'facturada' : enEspera ? 'en_espera' : r.ok || (!rechazo && !errorCliente) ? 'revisar' : 'rechazada';
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
    // En espera no es un fallo: se reintenta sola (reintentarEnEspera) y solo se avisa cuando se resuelve.
    if (estado !== 'en_espera') await this.avisarResultado(fila, estado, errorTexto, r.mode, yaFacturada, !yaFacturada && confirmada ? numeroDeRespuesta(r.data) : null);
    return (await this.repo.findOne({ where: { id, tenantId } }))!;
  }

  /**
   * Aviso por correo a la lista "Facturación" con el resultado de cada factura pedida a Oben (facturada, rechazada
   * o por revisar). Antes (7-oct) el flujo automático facturaba y NO avisaba a nadie. Oben no devuelve el número de
   * factura por la API: el correo lo dice y manda a consultarlo en OBEN MAS. Nunca tumba la facturación.
   */
  private async avisarResultado(fila: FacturaParcial, estado: EstadoFacturaParcial, errorTexto: string | null, modo: string | undefined, yaFacturada: boolean, numeroOben: string | null = null): Promise<void> {
    if (!this.distributionLists) return;
    try {
      const dest = await this.distributionLists.resolveRecipients('document', 'facturacion');
      if (dest.to.length === 0) {
        this.logger.warn(`PF ${fila.numberPF}: no hay lista "facturacion" con destinatarios: no se avisó por correo.`);
        return;
      }
      const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const [para, ...resto] = dest.to;
      const cc = [...resto, ...dest.cc];
      const titulo = { facturada: 'Factura creada en OBEN MAS', rechazada: 'Factura RECHAZADA por Oben', revisar: 'Factura por REVISAR en OBEN MAS', pendiente: 'Factura pendiente', facturando: 'Factura en proceso' }[estado];
      const simulado = modo === 'mock';
      const origen = fila.origen === 'automatico' ? `Automática (${fila.remitente ?? 'pedido nacional'})` : fila.origen === 'correo' ? 'Correo "Facturar Parcial" de Oben' : 'Digitada en pantalla';
      const detalle =
        estado === 'facturada'
          ? yaFacturada
            ? 'Oben indica que esa factura ya existía (sus artículos ya estaban cerrados): no se duplicó nada.'
            : 'Oben confirmó la creación.'
          : errorTexto ?? '';
      const html =
        `<p><b>${titulo}</b></p>` +
        `<table cellpadding="4" style="border-collapse:collapse">` +
        `<tr><td>Proforma</td><td><b>${esc(fila.numberPF)}</b></td></tr>` +
        `<tr><td>Distribución</td><td>${fila.numeroDistribucion ? esc(fila.numeroDistribucion) : 'Pedido completo'}</td></tr>` +
        `<tr><td>Origen</td><td>${esc(origen)}</td></tr>` +
        `<tr><td>Resultado</td><td>${esc(estado)}</td></tr>` +
        (numeroOben ? `<tr><td>Número que devolvió Oben</td><td><b>${esc(numeroOben)}</b></td></tr>` : '') +
        `</table>` +
        (detalle ? `<p>${esc(detalle)}</p>` : '') +
        (estado === 'facturada' ? '<p>' + (numeroOben ? 'Este número lo devuelve la API de Oben al crear la factura (pendiente confirmar con José si es el número fiscal); confróntalo en OBEN MAS.' : 'La API de Oben no entregó número: consúltalo en OBEN MAS.') + '</p>' : '') +
        (estado === 'revisar' ? '<p>No quedó claro si Oben la creó: verifica en OBEN MAS antes de reintentar.</p>' : '') +
        (simulado ? '<p><b>SIMULADO:</b> no se creó ninguna factura real.</p>' : '');
      const r = await this.hub.call<unknown>(
        'email',
        'send',
        { to: para, ...(cc.length ? { cc: cc.join(',') } : {}), ...(dest.bcc.length ? { bcc: dest.bcc.join(',') } : {}), subject: `${simulado ? '[SIMULADO] ' : ''}${titulo} — PF ${fila.numberPF}`, body: html },
        { maxAttempts: 1, timeoutMs: 30_000 },
      );
      if (!r.ok) this.logger.warn(`PF ${fila.numberPF}: no se pudo enviar el aviso por correo: ${r.error}`);
    } catch (err) {
      this.logger.warn(`PF ${fila.numberPF}: falló el aviso por correo: ${(err as Error).message}`);
    }
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
  async facturarOvNacional(numberOrderSales: number, cerradaEn?: Date): Promise<{ estado: string; motivo?: string; numberPF?: string }> {
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
    if (await this.suspendida()) return omitir('La facturación está suspendida hasta nueva orden.');
    if (!(await this.nacionalAutomatica())) return omitir('La factura automática de pedidos nacionales está apagada.');
    if ((await this.ovExcluidas()).has(numberOrderSales)) return omitir(`La OV ${numberOrderSales} está marcada para NO facturar.`);
    // Programación diaria (WO-032): solo lo que Oben programó para hoy, y solo si cerró antes del corte.
    const cierre = cerradaEn ?? this.reloj();
    const prog = await this.programadaHoy({ ov: numberOrderSales });
    if (prog.activa) {
      if (!prog.entrada) return omitir(noProgramada(prog.fecha));
      const tarde = motivoDeCorte(cierre, prog.fecha, prog.corte);
      if (tarde) return omitir(tarde, prog.entrada.numberPF);
    }
    const h = await this.encabezadoDeOv(numberOrderSales);
    if (!h?.proforma) return omitir('Oben no devolvió la proforma de la orden.');
    if (prog.entrada && prog.entrada.numberPF !== h.proforma) {
      return omitir(`La programación dice PF ${prog.entrada.numberPF} y Oben dice PF ${h.proforma} para esta orden: no se factura hasta aclararlo.`, h.proforma);
    }
    if (!/^col(ombia)?\b/i.test(h.pais)) {
      return omitir(`La orden es de ${h.pais || 'país desconocido'}: solo se facturan pedidos nacionales (Colombia).`, h.proforma);
    }
    const previa = await this.repo.find({ where: { tenantId, numberPF: h.proforma } });
    const espera = previa.filter((p) => p.estado === 'en_espera');
    if (espera.length > 0) {
      // Oben tenía la proforma en "Aprobación pendiente": se reintenta (sigue en espera si Oben aún no la aprueba).
      const estados = new Set<string>();
      for (const p of espera) {
        try {
          estados.add((await this.facturar(p.id, false, true)).estado);
        } catch (err) {
          estados.add('error');
          this.logger.warn(`PF ${h.proforma}: reintento en espera falló: ${(err as Error).message}`);
        }
      }
      return { estado: estados.size === 1 ? [...estados][0] : 'varias', numberPF: h.proforma, motivo: 'Reintento de una factura que esperaba aprobación en Oben.' };
    }
    if (previa.length > 0) {
      const pendientes = previa.filter((p) => p.estado === 'pendiente' && p.numeroDistribucion);
      if (!prog.activa || pendientes.length === 0) {
        return omitir(`La PF ${h.proforma} ya tiene una solicitud de factura (${previa.map((p) => p.estado).join(', ')}).`, h.proforma);
      }
      // Programación diaria: la orden cerró → se facturan los parciales que Oben había pedido para esa proforma
      // (cada uno con su número de distribución). Un parcial pedido DESPUÉS de este cierre espera su propio cierre.
      const listos = pendientes.filter((p) => !p.createdAt || new Date(p.createdAt).getTime() <= cierre.getTime() + TOLERANCIA_CIERRE_MS);
      if (listos.length === 0) {
        return omitir(`La PF ${h.proforma} tiene un parcial pendiente posterior al último cierre de la orden: se factura cuando la orden cierre de nuevo.`, h.proforma);
      }
      if (!(await this.automatica())) {
        return omitir(`La PF ${h.proforma} tiene ${listos.length} parcial(es) pendiente(s) y la factura parcial automática está apagada: se facturan con el botón.`, h.proforma);
      }
      const estados = new Set<string>();
      const partes: string[] = [];
      for (const p of listos) {
        try {
          const r = await this.facturar(p.id, false, true);
          estados.add(r.estado);
          partes.push(`distribución ${p.numeroDistribucion}: ${r.estado}`);
        } catch (err) {
          estados.add('error');
          partes.push(`distribución ${p.numeroDistribucion}: error — ${(err as Error).message}`);
        }
      }
      return { estado: estados.size === 1 ? [...estados][0] : 'varias', motivo: partes.join('; '), numberPF: h.proforma };
    }
    if (prog.entrada?.tipo === 'parcial') {
      return omitir('Está programada con saldo pendiente (factura PARCIAL): se factura con su correo "Facturar Parcial" (número de distribución), no como pedido completo.', h.proforma);
    }
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

  /**
   * Programación diaria (WO-032). Con `settings.facturacion.soloProgramadas === true` (`activa`) la facturación
   * automática solo factura lo que Oben programó para HOY ("se factura lo que Comercial y Despacho programan cada
   * día", reunión del 8-oct). `entrada` = la orden en la programación de hoy (null si no está); `corte` = minutos
   * del día de la hora de corte. Sin el interruptor no restringe nada.
   */
  private async programadaHoy(c: { ov?: number; pf?: string }): Promise<{ activa: boolean; entrada: FacturaProgramada | null; fecha: string; corte: number }> {
    const f = await this.ajustes();
    const fecha = fechaHoraBogota(this.reloj()).fecha;
    const corte = minutosDe(f?.horaCorte) ?? (minutosDe(HORA_CORTE_POR_DEFECTO) as number);
    if (f?.soloProgramadas !== true) return { activa: false, entrada: null, fecha, corte };
    if (!this.programadas) return { activa: true, entrada: null, fecha, corte };
    const entrada = await this.programadas.findOne({
      where: { tenantId: this.ctx.tenantId, fecha, ...(c.ov !== undefined ? { numberOrderSales: c.ov } : { numberPF: c.pf }) },
    });
    return { activa: true, entrada, fecha, corte };
  }

  /** Cuándo cerró la orden (aprobada en corte): el último envío exitoso de su Lista de Empaque. null = aún no cierra. */
  private async cierreDe(ov: number): Promise<Date | null> {
    const eventos = await this.audit.listForEntity('packing_list', String(ov));
    const envio = eventos.filter((e) => e.action === 'ov_approved_lista_empaque_enviada' && e.outputData?.ok !== false).pop();
    return envio ? new Date(envio.createdAt) : null;
  }

  /** Programación guardada de un día (por defecto hoy, hora de Bogotá). */
  async programacionDelDia(fecha?: string): Promise<FacturaProgramada[]> {
    if (!this.programadas) return [];
    const dia = fecha ?? fechaHoraBogota(this.reloj()).fecha;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new BadRequestException('La fecha debe venir como AAAA-MM-DD.');
    return this.programadas.find({ where: { tenantId: this.ctx.tenantId, fecha: dia }, order: { numberOrderSales: 'ASC' } });
  }

  /**
   * Carga el cuadro de Oben de lo que se factura un día. REEMPLAZA la programación de ese día (el plan cambia durante
   * el día: se vuelve a cargar el cuadro completo). No factura nada: para eso está `facturarProgramadasDeHoy`.
   */
  async programarDia(fecha: string, ordenes: OrdenProgramada[]): Promise<FacturaProgramada[]> {
    if (!this.programadas) throw new ConflictException('La programación de facturación no está disponible.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) {
      throw new BadRequestException('La fecha debe venir como AAAA-MM-DD.');
    }
    if (fecha < fechaHoraBogota(this.reloj()).fecha) throw new BadRequestException(`No se programa una fecha pasada (${fecha}).`);
    if (!Array.isArray(ordenes)) throw new BadRequestException('Falta la lista de órdenes.');
    const excluidas = await this.ovExcluidas();
    ordenes = ordenes.filter((o) => !excluidas.has(Number(o?.ov))); // OV marcadas "no facturar": no entran al cuadro
    const limpias = new Map<number, Required<Pick<OrdenProgramada, 'ov' | 'pf' | 'tipo'>> & Pick<OrdenProgramada, 'estadoOben' | 'cliente'>>();
    for (const o of ordenes) {
      const ov = Number(o?.ov);
      const pf = String(o?.pf ?? '').trim();
      if (!Number.isInteger(ov) || ov <= 0) throw new BadRequestException(`Orden de venta inválida: "${String(o?.ov)}".`);
      if (!/^\d{1,12}$/.test(pf)) throw new BadRequestException(`La orden ${ov} no trae una proforma numérica.`);
      const tipo = o.tipo ?? 'completa';
      if (tipo !== 'completa' && tipo !== 'parcial') throw new BadRequestException(`La orden ${ov} trae un tipo desconocido: "${String(o.tipo)}".`);
      const previa = limpias.get(ov);
      if (previa && previa.pf !== pf) throw new BadRequestException(`La orden ${ov} aparece dos veces con proformas distintas (${previa.pf} y ${pf}).`);
      limpias.set(ov, { ov, pf, tipo, estadoOben: o.estadoOben?.trim() || undefined, cliente: o.cliente?.trim() || undefined });
    }
    const tenantId = this.ctx.tenantId;
    const actuales = await this.programadas.find({ where: { tenantId, fecha } });
    const sobran = actuales.filter((a) => !limpias.has(a.numberOrderSales));
    if (sobran.length) await this.programadas.delete({ id: In(sobran.map((x) => x.id)), tenantId });
    for (const o of limpias.values()) {
      const cambios = { numberPF: o.pf, tipo: o.tipo, estadoOben: o.estadoOben ?? null, cliente: o.cliente ?? null };
      const existente = actuales.find((a) => a.numberOrderSales === o.ov);
      if (existente) await this.programadas.update({ id: existente.id, tenantId }, cambios);
      else await this.programadas.save(this.programadas.create({ tenantId, fecha, numberOrderSales: o.ov, ...cambios, cargadaPor: this.ctx.userId ?? null }));
    }
    await this.audit.log({
      workflowName: 'facturacion',
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: 'facturacion_programacion_cargada',
      entityType: 'facturacion_programada',
      entityId: fecha,
      actorId: this.ctx.userId,
      inputData: { fecha, ordenes: [...limpias.values()].map((o) => ({ ov: o.ov, pf: o.pf, tipo: o.tipo })) },
      outputData: { total: limpias.size, retiradas: sobran.map((x) => x.numberOrderSales) },
    });
    return this.programacionDelDia(fecha);
  }

  /**
   * Factura lo programado para HOY que ya se puede facturar: las órdenes que ya cerraron (salió su Lista de Empaque)
   * — el pedido completo, o sus parciales pendientes si Oben los pidió con "Facturar Parcial". Lo que aún no cierra
   * queda esperando: se factura solo al cerrar. Mismas reglas que el cierre en vivo: programada para hoy, cierre
   * antes del corte, solo Colombia, una factura por proforma o distribución, nada si está suspendida.
   */
  async facturarProgramadasDeHoy(): Promise<ResultadoProgramada[]> {
    const hoy = await this.programacionDelDia();
    const resultados: ResultadoProgramada[] = [];
    if (hoy.length === 0) return resultados;
    const suspendida = await this.suspendida();
    for (const p of hoy) {
      const base = { ov: p.numberOrderSales, pf: p.numberPF, tipo: p.tipo };
      if (suspendida) {
        resultados.push({ ...base, resultado: 'omitida', detalle: 'La facturación está suspendida hasta nueva orden.' });
        continue;
      }
      try {
        const cierre = await this.cierreDe(p.numberOrderSales);
        if (!cierre) {
          resultados.push({ ...base, resultado: 'espera_cierre', detalle: 'Aún no ha salido su Lista de Empaque: se factura sola cuando cierre (antes del corte).' });
          continue;
        }
        const r = await this.facturarOvNacional(p.numberOrderSales, cierre);
        resultados.push({ ...base, resultado: r.estado, detalle: r.motivo });
      } catch (err) {
        resultados.push({ ...base, resultado: 'error', detalle: (err as Error).message });
      }
    }
    await this.audit.log({
      workflowName: 'facturacion',
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: 'facturacion_programadas_procesadas',
      entityType: 'facturacion_programada',
      entityId: fechaHoraBogota(this.reloj()).fecha,
      actorId: this.ctx.userId,
      outputData: { resultados },
    });
    return resultados;
  }

  /**
   * Reintenta las solicitudes que Oben dejó en "Aprobación pendiente" (últimas 48 h). Las llama el procesador de
   * fondo cada 15 min; si Oben ya las aprobó se facturan y ahí sí sale el aviso por correo.
   */
  async reintentarEnEspera(): Promise<number> {
    const desde = new Date(this.reloj().getTime() - 48 * 3_600_000);
    const filas = await this.repo.find({ where: { tenantId: this.ctx.tenantId, estado: 'en_espera', updatedAt: MoreThanOrEqual(desde) } });
    let n = 0;
    for (const f of filas) {
      try {
        await this.facturar(f.id, false, f.origen === 'automatico');
        n++;
      } catch (err) {
        this.logger.warn(`PF ${f.numberPF}: reintento en espera falló: ${(err as Error).message}`);
      }
    }
    return n;
  }

  /** Ajustes de facturación del tenant (`settings.facturacion`); null si no se pueden leer. */
  private async ajustes(): Promise<Record<string, unknown> | null> {
    try {
      const t = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
      return (t?.settings?.facturacion ?? {}) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** `settings.facturacion.suspendida === true`: nada se factura (ni automático, ni parcial, ni el botón). Si no se puede leer, se asume suspendida (ante la duda, no se factura). */
  private async suspendida(): Promise<boolean> {
    try {
      const t = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
      const f = (t?.settings?.facturacion ?? {}) as Record<string, unknown>;
      return f.suspendida === true;
    } catch {
      return true;
    }
  }

  /** `settings.facturacion.noFacturarOv`: órdenes de venta que Hernán/Oben mandaron NO facturar (ni automático ni en el cuadro). */
  private async ovExcluidas(): Promise<Set<number>> {
    const f = await this.ajustes();
    const l = f?.noFacturarOv;
    return new Set(Array.isArray(l) ? l.map(Number).filter((n) => Number.isInteger(n)) : []);
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
