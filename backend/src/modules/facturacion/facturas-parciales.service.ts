import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { FacturaParcial, EstadoFacturaParcial } from '../../entities/factura-parcial.entity';
import { FacturaLlamada, ResultadoLlamadaFactura } from '../../entities/factura-llamada.entity';
import { FacturaProgramada, TipoFacturaProgramada } from '../../entities/factura-programada.entity';
import { Tenant } from '../../entities/tenant.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { FacturacionService } from './facturacion.service';
import { explicarFalla, explicacionHtml } from './factura-explicaciones';

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
/**
 * 19-oct, OV 11299: la primera llamada no respondió en 35 s y la verificación devolvió "Orden de venta
 * #CLOP_9891_OV ya ha sido procesado en otra instancia del navegador o por otro usuario". Eso NO es un rechazo:
 * casi seguro la primera llamada la facturó (o la está procesando). Queda en "revisar" para que nadie la
 * reintente a ciegas y la duplique.
 */
const PROCESADA_EN_OTRA = /ya ha sido procesad[oa] en otra instancia|procesad[oa] por otro usuario/i;

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

/**
 * Guardas contra facturas vacías y consecutivos dañados (diagnóstico del 23-oct): cada llamada a la API de factura
 * que Oben rechaza a mitad de camino puede dejarle una factura vacía con el consecutivo gastado. Por eso una
 * solicitud se pide como máximo una vez al día (dos si una persona confirma que verificó en OBEN MAS), hay un tope
 * diario de llamadas, los clientes bloqueados no se llaman y tras 3 fallos seguidos la facturación se suspende sola.
 */
const MAX_LLAMADAS_DIA_POR_DEFECTO = 25;
const FALLOS_SEGUIDOS_PARA_FRENO = 3;
/** Clientes con los que la API de Oben falla siempre (HTTP 400 "No se pudo crear la factura"): no se llaman hasta que José lo confirme. */
const CLIENTES_BLOQUEADOS_POR_DEFECTO = ['OBEN DISTRIBUIDORA'];
const RESULTADOS_FALLIDOS: ResultadoLlamadaFactura[] = ['rechazada', 'revisar', 'ya_facturada'];
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
    @Optional() private readonly facturacion?: FacturacionService,
    @Optional() @InjectRepository(FacturaLlamada) private readonly llamadas?: Repository<FacturaLlamada>,
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
      return this.facturar(fila.id, false, false, 'correo Facturar Parcial');
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
  async facturar(id: string, confirmoQueNoExiste = false, mercadoConfirmado = false, disparo = 'clic en pantalla'): Promise<FacturaParcial> {
    const tenantId = this.ctx.tenantId;
    const fila = await this.repo.findOne({ where: { id, tenantId } });
    if (!fila) throw new NotFoundException('Solicitud de factura parcial no encontrada.');
    // Terminal: la facturó Oben Xmart o ya estaba facturada en Oben — nunca se vuelve a pedir.
    if (fila.estado === 'facturada' || fila.estado === 'ya_facturada') return fila;
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
    // Guardas antes de llamar a Oben (23-oct): cada llamada de más puede dejarle a Oben una factura vacía.
    const bloqueo = await this.bloqueoAntesDeLlamar(fila, confirmoQueNoExiste);
    if (bloqueo?.yaFacturada) {
      await this.repo.update({ id, tenantId, estado: In(desde) }, { estado: 'ya_facturada', error: bloqueo.motivo });
      this.logger.log(`PF ${fila.numberPF} distribución ${fila.numeroDistribucion}: ya_facturada sin llamar a Oben — ${bloqueo.motivo}`);
      return (await this.repo.findOne({ where: { id, tenantId } }))!;
    }
    if (bloqueo) {
      await this.repo.update({ id, tenantId }, { error: bloqueo.motivo });
      this.logger.log(`PF ${fila.numberPF} distribución ${fila.numeroDistribucion}: no se llama a Oben — ${bloqueo.motivo}`);
      throw new ConflictException(bloqueo.motivo);
    }

    // Reclamo atómico: dos clics (o el correo y un clic) no facturan dos veces.
    const claim = await this.repo.update({ id, tenantId, estado: In(desde) }, { estado: 'facturando', error: null });
    if (!claim.affected) throw new ConflictException('Otra persona está facturando esta solicitud en este momento.');

    // UNA sola llamada por solicitud (23-oct): nunca se repite para "verificar". Lo dudoso queda en "revisar".
    const registro = await this.registrarLlamada(fila, disparo);
    const inicio = Date.now();
    const r = await this.hub.call<unknown>('obenCostOrder', 'factura.crear', { numberPF: fila.numberPF, numberDistribucion: fila.numeroDistribucion }, { maxAttempts: 1, timeoutMs: 90_000 });
    // Oben contesta un rechazo de negocio con HTTP 200+isSuccessful=false o con HTTP 4xx (visto el 2026-10-06: 400 "No se pudo crear la factura de venta"): en ambos casos NO se creó nada y es seguro reintentar.
    const esRechazo = (x: typeof r) => !x.ok && /^(Oben rechazó la operación|HTTP 4\d\d:)/.test(x.error ?? '');
    const esErrorCliente = (x: typeof r) => !x.ok && /BUSINESS_ERROR|pending_credentials|ssrf_blocked/.test(x.error ?? '');
    // Éxito = confirmación EXPLÍCITA de Oben (isSuccessful true o Code 200).
    const esExito = (x: typeof r) => x.ok && confirmaExito(x.data);
    // "El artículo N no se encuentra en la orden de venta" / "estado: Facturada": ya estaba facturada (no la creamos).
    const yaFacturada = !r.ok && YA_FACTURADA.test(r.error ?? '');
    const rechazo = esRechazo(r);
    const errorCliente = esErrorCliente(r);
    const confirmada = esExito(r);
    const enEspera = !confirmada && !yaFacturada && !r.ok && EN_ESPERA_OBEN.test(r.error ?? '');
    const procesadaEnOtra = !confirmada && !r.ok && PROCESADA_EN_OTRA.test(r.error ?? '');
    const estado: EstadoFacturaParcial = confirmada
      ? 'facturada'
      : yaFacturada
        ? 'ya_facturada'
        : enEspera
        ? 'en_espera'
        : procesadaEnOtra || r.ok || (!rechazo && !errorCliente)
          ? 'revisar'
          : 'rechazada';
    const errorTexto = confirmada
      ? null
      : yaFacturada
        ? `Oben dice que ya estaba facturada: la factura NO la creó Oben Xmart (la hizo Oben u otra solicitud) y no se vuelve a pedir. Respuesta de Oben: ${r.error}`
      : procesadaEnOtra
        ? `Oben dice que la orden la está procesando otro usuario: puede que la factura SÍ se haya creado. Verificar en OBEN MAS antes de reintentar. Respuesta de Oben: ${r.error}`
      : r.ok
        ? `Respuesta de Oben sin confirmación de éxito (${JSON.stringify(r.data ?? null).slice(0, 160)}). Verificar en OBEN MAS si la factura existe antes de reintentar.`
        : (r.error ?? 'Error desconocido');
    await this.repo.update(
      { id, tenantId },
      {
        estado,
        respuesta: (r.ok ? r.data : yaFacturada ? { yaFacturada: true, detalle: r.error } : null) as never,
        error: errorTexto,
        modo: r.mode ?? null,
        facturadoPor: this.ctx.userId ?? null,
        facturadaAt: confirmada ? new Date() : null,
      },
    );
    await this.audit.log({
      workflowName: 'facturacion',
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: confirmada ? 'factura_parcial_creada' : yaFacturada ? 'factura_ya_existia' : 'factura_parcial_fallida',
      entityType: 'proforma',
      entityId: fila.numberPF,
      actorId: this.ctx.userId,
      inputData: { numberPF: fila.numberPF, numeroDistribucion: fila.numeroDistribucion, origen: fila.origen, disparo },
      outputData: { ok: confirmada, estado, modo: r.mode ?? null, respuesta: r.ok ? r.data : null },
      reason: errorTexto,
    });
    this.logger.log(`PF ${fila.numberPF} distribución ${fila.numeroDistribucion}: ${estado}${errorTexto ? ` — ${errorTexto}` : ''}`);
    await this.cerrarLlamada(registro, estado as ResultadoLlamadaFactura, r.ok ? JSON.stringify(r.data ?? null) : (r.error ?? null), Date.now() - inicio);
    await this.frenoPorFallos(estado);
    // En espera no es un fallo: se reintenta sola (reintentarEnEspera) y solo se avisa cuando se resuelve.
    if (estado !== 'en_espera') await this.avisarResultado(fila, estado, errorTexto, r.mode, yaFacturada, confirmada ? numeroDeRespuesta(r.data) : null);
    return (await this.repo.findOne({ where: { id, tenantId } }))!;
  }

  /**
   * Aviso por correo a la lista "Facturación" con el resultado de cada factura pedida a Oben. Si se creó, lleva la
   * factura en PDF; si no, una explicación clara de qué pasó, qué significa y qué se hace (pedido de Hernán, 20-oct).
   * Nunca tumba la facturación.
   */
  private async avisarResultado(
    fila: FacturaParcial,
    estado: EstadoFacturaParcial,
    errorTexto: string | null,
    modo: string | undefined,
    yaFacturada: boolean,
    numeroOben: string | null = null,
    destino?: { para: string[] },
  ): Promise<{ enviado: boolean; detalle: string }> {
    if (!this.distributionLists) return { enviado: false, detalle: 'Sin listas de distribución.' };
    try {
      let para: string;
      let cc: string[] = [];
      let bcc: string[] = [];
      if (destino?.para?.length) {
        [para, ...cc] = destino.para;
      } else {
        const dest = await this.distributionLists.resolveRecipients('document', 'facturacion');
        if (dest.to.length === 0) {
          this.logger.warn(`PF ${fila.numberPF}: no hay lista "facturacion" con destinatarios: no se avisó por correo.`);
          return { enviado: false, detalle: 'La lista "facturacion" no tiene destinatarios.' };
        }
        const [primero, ...resto] = dest.to;
        para = primero;
        cc = [...resto, ...dest.cc];
        bcc = dest.bcc;
      }
      const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const simulado = modo === 'mock';
      const origen = fila.origen === 'automatico' ? `Automática (${fila.remitente ?? 'pedido nacional'})` : fila.origen === 'correo' ? 'Correo "Facturar Parcial" de Oben' : 'Digitada en pantalla';
      const ok = estado === 'facturada';
      const ctx = await this.contextoDeFalla(fila, errorTexto);
      const expl = ok ? null : explicarFalla(estado, errorTexto, ctx);
      const titulo = { facturada: 'Factura creada en OBEN MAS', ya_facturada: 'Ya estaba facturada en Oben (no la creó Oben Xmart)', rechazada: 'Factura RECHAZADA por Oben', revisar: 'Factura por REVISAR en OBEN MAS', en_espera: 'Factura en espera de aprobación en Oben', pendiente: 'Factura pendiente', facturando: 'Factura en proceso' }[estado];
      const pdf = ok ? await this.pdfDeLaFactura(fila) : null;
      const resumen =
        `<table cellpadding="4" style="border-collapse:collapse">` +
        `<tr><td>Proforma</td><td><b>${esc(fila.numberPF)}</b></td></tr>` +
        (ctx.cliente ? `<tr><td>Cliente</td><td>${esc(ctx.cliente)}</td></tr>` : '') +
        (ctx.ov ? `<tr><td>Orden de venta</td><td>${ctx.ov}</td></tr>` : '') +
        `<tr><td>Distribución</td><td>${fila.numeroDistribucion ? esc(fila.numeroDistribucion) : 'Pedido completo'}</td></tr>` +
        `<tr><td>Origen</td><td>${esc(origen)}</td></tr>` +
        `<tr><td>Resultado</td><td><b>${ok ? 'Factura creada' : estado === 'revisar' ? 'Por verificar en OBEN MAS' : 'No se creó la factura'}</b></td></tr>` +
        (numeroOben ? `<tr><td>Número que devolvió Oben</td><td><b>${esc(numeroOben)}</b></td></tr>` : '') +
        `</table>`;
      const cuerpoOk =
        (yaFacturada ? '<p>Oben indica que esa factura ya existía (sus artículos ya estaban cerrados): no se duplicó nada.</p>' : '<p>Oben confirmó la creación de la factura.</p>') +
        (numeroOben ? '<p>Este número lo devuelve la API de Oben al crear la factura (pendiente confirmar con José si es el número fiscal); confróntalo en OBEN MAS.</p>' : '<p>La API de Oben no entregó número: consúltalo en OBEN MAS.</p>') +
        (pdf?.adjuntos.length
          ? `<p><b>Se adjunta la factura en PDF.</b> ${esc(pdf.nota)}</p>`
          : `<p><b>No se pudo adjuntar el PDF de la factura.</b> ${esc(pdf?.nota ?? 'No está disponible.')}</p>`);
      const html = `<p><b>${esc(titulo)}${expl ? ` — ${esc(expl.titulo)}` : ''}</b></p>${resumen}${ok ? cuerpoOk : explicacionHtml(expl!)}${simulado ? '<p><b>SIMULADO:</b> no se creó ninguna factura real.</p>' : ''}`;
      const r = await this.hub.call<unknown>(
        'email',
        'send',
        {
          to: para,
          ...(cc.length ? { cc: cc.join(',') } : {}),
          ...(bcc.length ? { bcc: bcc.join(',') } : {}),
          subject: `${simulado ? '[SIMULADO] ' : ''}${titulo} — PF ${fila.numberPF}`,
          body: html,
          ...(pdf?.adjuntos.length ? { attachments: pdf.adjuntos } : {}),
        },
        { maxAttempts: 1, timeoutMs: 60_000 },
      );
      if (!r.ok) {
        this.logger.warn(`PF ${fila.numberPF}: no se pudo enviar el aviso por correo: ${r.error}`);
        return { enviado: false, detalle: String(r.error ?? 'Error desconocido al enviar el correo.') };
      }
      return { enviado: true, detalle: pdf?.adjuntos.length ? `con ${pdf.adjuntos.length} PDF` : ok ? `sin PDF (${pdf?.nota ?? ''})` : 'con la explicación' };
    } catch (err) {
      this.logger.warn(`PF ${fila.numberPF}: falló el aviso por correo: ${(err as Error).message}`);
      return { enviado: false, detalle: (err as Error).message };
    }
  }

  /**
   * Reenvía el aviso de una solicitud ya procesada (por ejemplo, a una persona concreta que no lo recibió).
   * Con `para` va solo a esas personas; sin él, a la lista de Facturación. No pide nada a Oben.
   */
  async reenviarAviso(id: string, para?: string[]): Promise<{ enviado: boolean; detalle: string }> {
    const tenantId = this.ctx.tenantId;
    const fila = await this.repo.findOne({ where: { id, tenantId } });
    if (!fila) throw new NotFoundException('Solicitud de factura no encontrada.');
    if (!['facturada', 'rechazada', 'revisar', 'en_espera'].includes(fila.estado)) {
      throw new BadRequestException(`La solicitud está "${fila.estado}": todavía no hay resultado que avisar.`);
    }
    const limpios = (para ?? []).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if ((para ?? []).length > 0 && limpios.length === 0) throw new BadRequestException('Los correos indicados no son válidos.');
    const resp = (fila.respuesta ?? null) as Record<string, unknown> | null;
    const yaFacturada = !!resp && resp.yaFacturada === true;
    const numeroOben = fila.estado === 'facturada' && !yaFacturada ? numeroDeRespuesta(resp) : null;
    const r = await this.avisarResultado(fila, fila.estado, fila.error, fila.modo ?? undefined, yaFacturada, numeroOben, limpios.length ? { para: limpios } : undefined);
    await this.audit.log({
      workflowName: 'facturacion',
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'factura_aviso_reenviado',
      entityType: 'proforma',
      entityId: fila.numberPF,
      actorId: this.ctx.userId,
      inputData: { numberPF: fila.numberPF, numeroDistribucion: fila.numeroDistribucion, para: limpios },
      outputData: r,
    });
    return r;
  }

  /** Cliente, orden y patrón de rechazos repetidos para explicar una falla con datos concretos. */
  private async contextoDeFalla(fila: FacturaParcial, errorTexto: string | null) {
    const ctx: { numberPF: string; numeroDistribucion: string; cliente: string | null; ov: number | null; otrasConMismoError: string[] } = {
      numberPF: fila.numberPF,
      numeroDistribucion: fila.numeroDistribucion,
      cliente: null,
      ov: null,
      otrasConMismoError: [],
    };
    try {
      const m = /^OV\s+(\d+)/i.exec(fila.remitente ?? '');
      if (m) ctx.ov = Number(m[1]);
      const prog = this.programadas ? await this.programadas.find({ where: { tenantId: this.ctx.tenantId, numberPF: fila.numberPF } }) : [];
      const ultima = prog.sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)))[0];
      if (ultima) {
        ctx.cliente = ultima.cliente ?? null;
        ctx.ov ??= ultima.numberOrderSales;
      }
      const huella = (errorTexto ?? '').slice(0, 70);
      if (huella) {
        const rechazadas = await this.repo.find({ where: { tenantId: this.ctx.tenantId, estado: 'rechazada' } });
        ctx.otrasConMismoError = rechazadas.filter((x) => x.numberPF !== fila.numberPF && (x.error ?? '').startsWith(huella)).map((x) => x.numberPF);
      }
    } catch {
      /* el contexto es un extra: nunca impide el aviso */
    }
    return ctx;
  }

  /** PDF de la factura (réplica del formato de Oben con los datos de Oben). Nunca emite nada. */
  private async pdfDeLaFactura(fila: FacturaParcial): Promise<{ adjuntos: Array<Record<string, unknown>>; nota: string }> {
    if (!this.facturacion) return { adjuntos: [], nota: 'El generador de PDF no está disponible en este servicio.' };
    try {
      let ovs: number[] = [];
      const m = /^OV\s+(\d+)/i.exec(fila.remitente ?? '');
      if (m) ovs = [Number(m[1])];
      if (ovs.length === 0) ovs = (await this.facturacion.ordenesDeProforma(fila.numberPF)).ordenesVenta;
      if (ovs.length === 0) return { adjuntos: [], nota: 'Oben no devolvió la orden de venta de la proforma.' };
      const adjuntos: Array<Record<string, unknown>> = [];
      const avisos: string[] = [];
      for (const ov of ovs.slice(0, 3)) {
        const doc = await this.facturacion.generateDocument(ov, { parcial: !!fila.numeroDistribucion });
        adjuntos.push({
          filename: `Factura-PF${fila.numberPF}${fila.numeroDistribucion ? `-dist${fila.numeroDistribucion}` : ''}-OV${ov}.pdf`,
          content: doc.pdf.toString('base64'),
          encoding: 'base64',
          contentType: 'application/pdf',
        });
        avisos.push(...(doc.avisos ?? []));
      }
      const parcial = fila.numeroDistribucion ? ' Es una factura parcial: el PDF toma la Lista de Empaque de la orden; las cantidades de la distribución las define Oben.' : '';
      return {
        adjuntos,
        nota:
          'Es la factura armada por Oben Xmart con los datos de Oben (mismo formato de Oben); el documento fiscal oficial es el de OBEN MAS.' +
          parcial +
          (avisos.length ? ` Avisos: ${[...new Set(avisos)].join(' · ')}` : ''),
      };
    } catch (err) {
      const body = (err as { getResponse?: () => unknown }).getResponse?.() as { message?: string; missing?: string[] } | undefined;
      const falta = body?.missing?.length ? ` Faltan datos: ${body.missing.join('; ')}.` : '';
      return { adjuntos: [], nota: `No se pudo armar el PDF: ${body?.message ?? (err as Error).message}.${falta}` };
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

  private async encabezadoDeOv(ov: number): Promise<{ pais: string; proforma: string; cliente: string } | null> {
    const r = await this.hub.call<unknown>('obenCostOrder', 'query.run', { procedure: 'spEmpaqueUnificada_Paradixe', numberOrderSales: ov }, { maxAttempts: 2, timeoutMs: 60_000 });
    const h = r.ok ? (Array.isArray(r.data) ? (r.data as unknown[])[0] : r.data) : null;
    if (!h || typeof h !== 'object') return null;
    const o = h as Record<string, unknown>;
    return { pais: String(o.Pais ?? '').trim(), proforma: String(o.Proforma ?? '').trim(), cliente: String(o.Cliente ?? '').trim() };
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
          estados.add((await this.facturar(p.id, false, true, `cierre de la OV ${numberOrderSales}`)).estado);
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
          const r = await this.facturar(p.id, false, true, `cierre de la OV ${numberOrderSales}`);
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
    const r = await this.facturar(fila.id, false, true, `cierre de la OV ${numberOrderSales}`);
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
        // Regla de José (13-oct): un PARCIAL ("Facturar Parcial") se factura sin esperar el cierre ni la Lista de Empaque,
        // apenas su orden está en el cuadro del día. Si el correo llegó ANTES de cargar el cuadro, quedó pendiente: se
        // factura aquí. Siguen las guardas de siempre (solo Colombia, una vez por distribución, aviso por correo).
        let parcialesProcesados = 0;
        if (await this.automatica()) {
          const pendientes = (await this.repo.find({ where: { tenantId: this.ctx.tenantId, numberPF: p.numberPF } })).filter((x) => x.estado === 'pendiente' && x.numeroDistribucion);
          for (const x of pendientes) {
            parcialesProcesados += 1;
            try {
              const r = await this.facturar(x.id, false, false, 'cuadro del dia');
              resultados.push({ ...base, resultado: r.estado, detalle: `distribución ${x.numeroDistribucion}${r.error ? `: ${r.error}` : ''}` });
            } catch (err) {
              resultados.push({ ...base, resultado: 'omitida', detalle: `distribución ${x.numeroDistribucion}: ${(err as Error).message}` });
            }
          }
        }
        if (parcialesProcesados > 0 && p.tipo === 'parcial') continue;
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
   * Reintenta las solicitudes que Oben dejó en "Aprobación pendiente" (últimas 48 h). Antes del 23-oct se reintentaban
   * cada 15 min (la PF 11611 se pidió 12 veces en 2 h): ahora como MÁXIMO una vez al día y solo si la proforma está en
   * el cuadro de hoy (con la programación diaria activa). Si Oben ya la aprobó, se factura y sale el aviso.
   */
  async reintentarEnEspera(): Promise<number> {
    const desde = new Date(this.reloj().getTime() - 48 * 3_600_000);
    const filas = await this.repo.find({ where: { tenantId: this.ctx.tenantId, estado: 'en_espera', updatedAt: MoreThanOrEqual(desde) } });
    let n = 0;
    for (const f of filas) {
      if ((await this.llamadasDeHoy({ solicitudId: f.id })).length > 0) continue; // ya se le pidió hoy
      const prog = await this.programadaHoy({ pf: f.numberPF });
      if (prog.activa && !prog.entrada) continue; // no está en el cuadro de hoy
      try {
        await this.facturar(f.id, false, f.origen === 'automatico', 'reintento diario (en espera)');
        n++;
      } catch (err) {
        this.logger.warn(`PF ${f.numberPF}: reintento en espera falló: ${(err as Error).message}`);
      }
    }
    return n;
  }

  /**
   * Por qué NO se debe llamar a Oben para esta solicitud (null = se puede). `yaFacturada` = el cuadro de Oben ya la
   * muestra facturada: queda así sin llamar.
   */
  private async bloqueoAntesDeLlamar(fila: FacturaParcial, confirmoQueNoExiste: boolean): Promise<{ motivo: string; yaFacturada?: boolean } | null> {
    const f = await this.ajustes();
    // 1. El cuadro de Oben ya la muestra FACTURADA (pedido completo): pedirla otra vez solo puede dejar una factura vacía.
    if (this.programadas && !fila.numeroDistribucion) {
      const prog = await this.programadas.find({ where: { tenantId: this.ctx.tenantId, numberPF: fila.numberPF } });
      const ultima = prog.sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)))[0];
      if (ultima?.estadoOben && /FACTURAD/i.test(ultima.estadoOben)) {
        return { yaFacturada: true, motivo: `El cuadro de Oben del ${ultima.fecha} la muestra "${ultima.estadoOben}": ya está facturada, no se pide.` };
      }
    }
    // 2. Clientes con los que la API de Oben falla siempre.
    const lista = Array.isArray(f?.clientesBloqueados) ? (f!.clientesBloqueados as unknown[]).map(String) : CLIENTES_BLOQUEADOS_POR_DEFECTO;
    const cliente = (await this.clienteDe(fila)).toUpperCase();
    const bloqueado = cliente ? lista.map((c) => c.toUpperCase()).find((b) => b && cliente.includes(b)) : undefined;
    if (bloqueado) {
      return {
        motivo: `El cliente ${cliente} está bloqueado para pedir facturas por la API: Oben siempre lo rechaza ("No se pudo crear la factura de venta"). No se llama hasta que José lo confirme; mientras tanto se factura en OBEN MAS.`,
      };
    }
    if (!this.llamadas) return null;
    // 3. Una llamada que salió y nunca volvió (el proceso se cayó en medio): no se sabe qué quedó en Oben.
    const previas = await this.llamadas.find({ where: { tenantId: this.ctx.tenantId, solicitudId: fila.id }, order: { createdAt: 'DESC' }, take: 5 });
    if (previas.some((l) => l.resultado === 'enviada') && !confirmoQueNoExiste) {
      return { motivo: 'Una llamada anterior a Oben no terminó: verifica en OBEN MAS qué quedó y confirma antes de reintentar.' };
    }
    // 4. Una vez al día por solicitud (dos si una persona confirma que verificó en OBEN MAS).
    const hoy = await this.llamadasDeHoy({ solicitudId: fila.id });
    if (hoy.length >= (confirmoQueNoExiste ? 2 : 1)) {
      const u = hoy[0];
      return {
        motivo: `Ya se le pidió a Oben hoy (${hhmm(fechaHoraBogota(new Date(u.createdAt)).minutos)}, resultado: ${u.resultado}). Para no dejar facturas vacías se pide como máximo una vez al día${confirmoQueNoExiste ? '' : '; si verificaste en OBEN MAS que no existe, confirma para un último intento'}.`,
      };
    }
    // 5. Tope diario de llamadas.
    const max = Number(f?.maxLlamadasDia) > 0 ? Number(f!.maxLlamadasDia) : MAX_LLAMADAS_DIA_POR_DEFECTO;
    if ((await this.llamadasDeHoy({})).length >= max) {
      return { motivo: `Se alcanzó el tope de ${max} llamadas de factura a Oben de hoy: lo demás se pide mañana (o se sube el tope si Oben lo autoriza).` };
    }
    return null;
  }

  /** Cliente de la solicitud: el del cuadro de Oben, o el de su orden de venta. '' si no se sabe. */
  private async clienteDe(fila: FacturaParcial): Promise<string> {
    if (this.programadas) {
      const prog = await this.programadas.find({ where: { tenantId: this.ctx.tenantId, numberPF: fila.numberPF } });
      const conCliente = prog.filter((x) => x.cliente).sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)))[0];
      if (conCliente?.cliente) return conCliente.cliente;
    }
    const ov = /^OV\s+(\d+)/i.exec(fila.remitente ?? '');
    if (ov) return (await this.encabezadoDeOv(Number(ov[1])).catch(() => null))?.cliente ?? '';
    return '';
  }

  /** Llamadas de factura de HOY (hora de Bogotá), de una solicitud o de todo el tenant; la más reciente primero. */
  private async llamadasDeHoy(c: { solicitudId?: string }): Promise<FacturaLlamada[]> {
    if (!this.llamadas) return [];
    const inicioDia = new Date(Date.parse(`${fechaHoraBogota(this.reloj()).fecha}T05:00:00Z`)); // 00:00 en Bogotá
    return this.llamadas.find({
      where: { tenantId: this.ctx.tenantId, createdAt: MoreThanOrEqual(inicioDia), ...(c.solicitudId ? { solicitudId: c.solicitudId } : {}) },
      order: { createdAt: 'DESC' },
    });
  }

  private async registrarLlamada(fila: FacturaParcial, disparo: string): Promise<FacturaLlamada | null> {
    if (!this.llamadas) return null;
    return this.llamadas.save(
      this.llamadas.create({
        tenantId: this.ctx.tenantId,
        solicitudId: fila.id,
        numberPF: fila.numberPF,
        numeroDistribucion: fila.numeroDistribucion ?? '',
        disparo: disparo.slice(0, 40),
        resultado: 'enviada',
        usuarioId: this.ctx.userId ?? null,
        createdAt: this.reloj(),
      }),
    );
  }

  private async cerrarLlamada(l: FacturaLlamada | null, resultado: ResultadoLlamadaFactura, respuesta: string | null, duracionMs: number): Promise<void> {
    if (!l || !this.llamadas) return;
    await this.llamadas.update({ id: l.id, tenantId: this.ctx.tenantId }, { resultado, respuesta: respuesta?.slice(0, 4000) ?? null, duracionMs, terminadaAt: this.reloj() });
  }

  /** Freno: tras 3 llamadas seguidas que no crean factura (rechazo, duda o "ya estaba facturada"), la facturación se suspende sola y avisa. */
  private async frenoPorFallos(ultimo: EstadoFacturaParcial): Promise<void> {
    if (!this.llamadas || !RESULTADOS_FALLIDOS.includes(ultimo as ResultadoLlamadaFactura)) return;
    const ultimas = await this.llamadas.find({ where: { tenantId: this.ctx.tenantId }, order: { createdAt: 'DESC' }, take: FALLOS_SEGUIDOS_PARA_FRENO });
    if (ultimas.length < FALLOS_SEGUIDOS_PARA_FRENO || !ultimas.every((l) => RESULTADOS_FALLIDOS.includes(l.resultado))) return;
    const t = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
    if (!t) return;
    const fact = (t.settings?.facturacion ?? {}) as Record<string, unknown>;
    if (fact.suspendida === true) return;
    const motivo = `Freno automático: ${FALLOS_SEGUIDOS_PARA_FRENO} llamadas seguidas a Oben sin crear factura (${ultimas.map((l) => `PF ${l.numberPF}: ${l.resultado}`).join('; ')}).`;
    const settings = { ...(t.settings ?? {}), facturacion: { ...fact, suspendida: true, suspendidaPor: 'freno automático', suspendidaMotivo: motivo, suspendidaEn: this.reloj().toISOString() } };
    await this.tenants.update({ id: t.id }, { settings: settings as never });
    this.logger.warn(`Facturación SUSPENDIDA por el freno automático — ${motivo}`);
    await this.audit.log({ workflowName: 'facturacion', eventType: WorkflowEventType.ACTION_EXECUTED, action: 'facturacion_freno_automatico', entityType: 'tenant', entityId: t.id, actorId: this.ctx.userId, reason: motivo });
    await this.avisarFreno(motivo);
  }

  private async avisarFreno(motivo: string): Promise<void> {
    if (!this.distributionLists) return;
    try {
      const dest = await this.distributionLists.resolveRecipients('document', 'facturacion');
      if (dest.to.length === 0) return;
      const [para, ...resto] = dest.to;
      const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      await this.hub.call(
        'email',
        'send',
        {
          to: para,
          ...(resto.length || dest.cc.length ? { cc: [...resto, ...dest.cc].join(',') } : {}),
          subject: 'Facturación SUSPENDIDA automáticamente — Oben Xmart',
          body:
            `<p><b>Qué pasó:</b> ${esc(motivo)}</p>` +
            '<p><b>Qué significa:</b> cuando Oben rechaza varias facturas seguidas algo está mal (de su lado o en los datos), y cada llamada fallida puede dejar una factura vacía con el consecutivo gastado. Para no dañar más consecutivos, Oben Xmart dejó de pedir facturas.</p>' +
            '<p><b>Qué se hace:</b> revisar en OBEN MAS las proformas de arriba (si quedó alguna factura vacía, anularla) y, cuando esté claro, reactivar la facturación.</p>',
        },
        { maxAttempts: 1, timeoutMs: 30_000 },
      );
    } catch (err) {
      this.logger.warn(`No se pudo avisar el freno de facturación: ${(err as Error).message}`);
    }
  }

  /** Registro de llamadas a la API de factura de un día, hora de Bogotá (para cruzar con Oben). */
  async llamadasDelDia(fecha?: string): Promise<FacturaLlamada[]> {
    if (!this.llamadas) return [];
    const dia = fecha ?? fechaHoraBogota(this.reloj()).fecha;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new BadRequestException('La fecha debe venir como AAAA-MM-DD.');
    const inicio = new Date(Date.parse(`${dia}T05:00:00Z`));
    const fin = new Date(inicio.getTime() + 24 * 3_600_000);
    return this.llamadas
      .createQueryBuilder('l')
      .where('l.tenant_id = :t AND l.created_at >= :i AND l.created_at < :f', { t: this.ctx.tenantId, i: inicio, f: fin })
      .orderBy('l.created_at', 'ASC')
      .getMany();
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
