import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { Client } from '../../entities/client.entity';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { OBEN_QUERY_OPTIONS } from '../oben-reports/oben-reports.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { CheckSettlementResponse } from '../liquidacion/liquidacion.types';
import type {
  FacturaElectronica,
  FacturacionDocument,
  FacturacionDraft,
  FacturacionInput,
  FacturacionKind,
  FacturacionLine,
  FacturacionSendResult,
} from './facturacion.types';
import { FacturacionPdfService } from './facturacion-pdf.service';

const WORKFLOW_NAME = 'facturacion';
/** Una factura electrónica es permanente: la clave de idempotencia de su emisión no debe expirar nunca en la práctica. */
const DIAN_IDEMPOTENCY_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;
/** La emisión DIAN es una escritura real no repetible: nunca se reintenta sola (mismo criterio que Liquidación). */
const DIAN_WRITE_OPTIONS = { maxAttempts: 1, timeoutMs: 60_000 };
const round2 = (n: number) => Math.round(n * 100) / 100;
const isColombia = (pais: string | null) => !!pais && /^col(ombia)?\b/i.test(pais.trim());
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Número desde la respuesta de Oben: `Number(null)`/`Number('')` darían 0 — un precio o kilos ausente NO es 0. */
const toNum = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
/** ILIKE sin comodines: `%`/`_` en el nombre del cliente no deben emparejar a otro cliente. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
/** ¿Pudo la emisión haber llegado al proveedor pese al error? (mismo criterio que Liquidación) */
const isAmbiguous = (error?: string) =>
  /timeout|time-out|timed out|econnreset|econnrefused|socket|network|fetch failed|abort|\bHTTP 50[24]\b/i.test(error ?? '');

/**
 * Texto desde la respuesta de Oben (spEmpaqueUnificada): string o número
 * (p. ej. una Proforma que llegue como 11271); null/objeto/vacío = ausente.
 * Antes se hacía `.trim()` directo sobre el dato externo: un número lanzaba
 * TypeError y el borrador respondía 500 en vez de listar lo que falta.
 */
const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
  return s || null;
};

/** Campos de spEmpaqueUnificada_Paradixe que usa Facturación, ya normalizados. */
interface EmpaqueUnificadaHeader {
  /** true si vino del simulador de obenCostOrder (dev/demo) — en producción es real. */
  simulated: boolean;
  Cliente: string;
  Pais: string | null;
  CodigoMaterial: string | null;
  Contenedor: string | null;
  Proforma: string | null;
  OrdenCompra: string | null;
}

/**
 * Preparación del documento de Facturación (los 3 flujos de
 * `Business/OBEN MAS - PARADIXE.pdf`: Exportación, Nacional Completo,
 * Nacional Parcial) a partir de datos REALES ya disponibles hoy
 * (spEmpaqueUnificada_Paradixe + spCheckSettlement_Paradixe, las mismas
 * fuentes que Lista de Empaque y Liquidación).
 *
 * Lo que todavía no tiene fuente real se toma de un sistema SIMULADO del
 * Integration Hub y queda marcado como tal en el borrador, el PDF y el correo:
 *  - Dirección de entrega de Exportación: si no la digitaron ni está en el
 *    maestro de clientes, se toma de la Proforma en `obenPlus` (Oben+).
 *  - Factura electrónica: `dian` → `invoice.send` al ENVIAR (no al descargar),
 *    idempotente por orden. Hoy no hay proveedor DIAN definido, así que el
 *    CUFE es SIMULADO; cuando lo haya, se conecta el adapter real sin tocar
 *    este servicio. Candado: nunca se emite una factura REAL con datos
 *    simulados.
 * Lo que no tiene ni fuente real ni simulada bloquea `readyToGenerate` y queda
 * en `missing` — nunca se inventa.
 */
@Injectable()
export class FacturacionService {
  private readonly logger = new Logger(FacturacionService.name);

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    private readonly distributionLists: DistributionListsService,
    private readonly pdf: FacturacionPdfService,
    @InjectRepository(Client)
    private readonly clients: Repository<Client>,
    private readonly idempotency: IdempotencyService,
  ) {}

  async getDraft(numberOrderSales: number, input: FacturacionInput = {}): Promise<FacturacionDraft> {
    const header = await this.fetchHeader(numberOrderSales);
    const missing: string[] = [];

    const cliente = header?.Cliente ?? '';
    const pais = header?.Pais ?? null;
    const proforma = header?.Proforma ?? null;

    if (!header) missing.push('Datos del pedido: no se pudo consultar spEmpaqueUnificada_Paradixe en Oben.');
    if (header && !pais) {
      missing.push('País de destino: la respuesta de Oben no lo trae — sin él no se puede clasificar Exportación/Nacional.');
    }
    if (header && !proforma) missing.push('Proforma: la respuesta de Oben no la trae — sin ella no se pueden traer precios por película.');

    const kind: FacturacionKind | null = !pais
      ? null
      : isColombia(pais)
        ? input.parcial
          ? 'nacional_parcial'
          : 'nacional_completo'
        : 'exportacion';

    const simulatedFields: string[] = header?.simulated ? ['pedido'] : [];
    let lines: FacturacionLine[] = [];
    if (proforma) {
      const fetched = await this.fetchCheckSettlement(proforma);
      const check = fetched?.check;
      if (fetched?.simulated) simulatedFields.push('precios');
      if (!check) {
        missing.push(`Precios por película: no se pudo consultar spCheckSettlement_Paradixe para la Proforma ${proforma}.`);
      } else {
        lines = check.Detalle.map((l) => {
          const precio = toNum(l.Precio);
          const kilosTotal = toNum(l.KilosTotales);
          return {
            codSecLineFilm: toNum(l.CodSed_LineFilm),
            tipoPelicula: l.TipoPelicula,
            precio,
            kilosTotal,
            valorLinea: round2(precio * kilosTotal),
          };
        });
      }
    }

    let direccionEntrega: string | null = input.direccionEntrega?.trim() || null;
    let direccionFuente: FacturacionDraft['direccionFuente'] = direccionEntrega ? 'digitada' : null;
    let direccionAmbigua = false;
    if (!direccionEntrega && cliente) {
      // Hasta 2 filas: si el nombre coincide con más de un cliente del maestro,
      // elegir uno sería adivinar la dirección.
      const matches = await this.clients.find({
        where: { tenantId: this.ctx.tenantId, name: ILike(escapeLike(cliente)) },
        take: 2,
      });
      direccionAmbigua = matches.length > 1;
      if (matches.length === 1 && matches[0].address?.trim()) {
        direccionEntrega = matches[0].address.trim();
        direccionFuente = 'maestro_clientes';
      }
    }
    if (!direccionEntrega && kind === 'exportacion' && proforma) {
      // Tercera fuente: la Proforma en Oben+ (hoy SIMULADA — queda marcada).
      const plus = await this.fetchObenPlusAddress(proforma);
      if (plus) {
        direccionEntrega = plus.direccion;
        direccionFuente = 'oben_plus';
        if (plus.simulated) simulatedFields.push('direccionEntrega');
      }
    }
    if (kind === 'exportacion' && !direccionEntrega) {
      missing.push(
        direccionAmbigua
          ? `Dirección de entrega: hay más de un cliente "${cliente}" en el maestro de clientes y Oben+ no la trae — no se elige una a ciegas; digítala.`
          : 'Dirección de entrega: no la trae ni el maestro de clientes ni la Proforma en Oben+ — requerida para Exportación.',
      );
    }

    const totalValor = round2(lines.reduce((a, l) => a + l.valorLinea, 0));
    const totalKilos = round2(lines.reduce((a, l) => a + l.kilosTotal, 0));

    return {
      numberOrderSales,
      cliente,
      pais,
      proforma,
      ordenCompra: header?.OrdenCompra ?? null,
      contenedor: header?.Contenedor ?? null,
      codigoMaterial: header?.CodigoMaterial ?? null,
      kind,
      direccionEntrega,
      direccionFuente,
      observaciones: input.observaciones?.trim() || null,
      infoComercial: input.infoComercial?.trim() || null,
      lines,
      totalValor,
      totalKilos,
      missing,
      readyToGenerate: missing.length === 0,
      simulated: simulatedFields.length > 0,
      simulatedFields,
    };
  }

  /**
   * Arma el PDF. Con `emit:true` (solo desde `send`) emite antes la factura
   * electrónica; sin él (descarga) solo muestra la emisión previa si existe —
   * descargar un PDF nunca emite un documento fiscal.
   */
  async generateDocument(
    numberOrderSales: number,
    input: FacturacionInput = {},
    options: { emit?: boolean } = {},
  ): Promise<FacturacionDocument> {
    const draft = await this.getDraft(numberOrderSales, input);
    if (!draft.readyToGenerate) {
      throw new BadRequestException({
        message: 'El documento de facturación no se puede generar todavía: faltan datos (no se inventan).',
        missing: draft.missing,
      });
    }
    const facturaElectronica = options.emit
      ? await this.emitirFacturaElectronica(draft)
      : await this.facturaElectronicaEmitida(numberOrderSales);
    const pdf = await this.pdf.build(draft, facturaElectronica);
    const filename = `Factura_Borrador-OV${numberOrderSales}.pdf`;
    return { draft, filename, pdf, facturaElectronica };
  }

  /**
   * Envía el documento a la lista de distribución "facturacion" (COMEX /
   * Distribución, según el tipo de pedido lo defina quien la configure).
   * Bloquea un segundo envío accidental para la misma orden a menos que se
   * pida `force:true` — mismo criterio de "nunca duplicar sin querer" que el
   * resto del sistema.
   */
  async send(numberOrderSales: number, input: FacturacionInput = {}, force = false): Promise<FacturacionSendResult> {
    if (!force) {
      // Un intento FALLIDO también se audita como 'facturacion_enviada' (con
      // ok:false): no cuenta como envío — si no, un fallo de SMTP bloqueaba el
      // reintento con un "ya se envió" falso.
      const events = await this.audit.listForEntity('facturacion', String(numberOrderSales));
      if (events.some((e) => e.action === 'facturacion_enviada' && e.outputData?.ok !== false)) {
        throw new ConflictException(
          `Ya se envió un documento de facturación para la orden ${numberOrderSales}. Usa force:true si de verdad quieres reenviarlo.`,
        );
      }
    }

    const resolved = await this.distributionLists.resolveRecipients('document', 'facturacion');
    if (resolved.to.length === 0) {
      throw new BadRequestException(
        'No hay ninguna lista de distribución asociada a "facturacion" — configúrala en Listas de Distribución.',
      );
    }

    const { draft, filename, pdf, facturaElectronica } = await this.generateDocument(numberOrderSales, input, { emit: true });
    const factura = facturaElectronica!;
    const simulated = draft.simulated || factura.simulated;
    const [primaryTo, ...restTo] = resolved.to;
    const cc = [...restTo, ...resolved.cc];

    const sendResult = await this.hub.call<{ id: string }>(
      'email',
      'send',
      {
        to: primaryTo,
        ...(cc.length ? { cc: cc.join(',') } : {}),
        subject: `${simulated ? '[SIMULADO] ' : ''}Borrador de Facturación — Orden ${numberOrderSales}`,
        body: this.emailBody(draft, factura),
        attachments: [{ filename, content: pdf.toString('base64'), encoding: 'base64', contentType: 'application/pdf' }],
      },
      { maxAttempts: 1, timeoutMs: 30_000 },
    );

    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'facturacion_enviada',
      entityType: 'facturacion',
      entityId: String(numberOrderSales),
      actorId: this.ctx.userId,
      outputData: {
        to: primaryTo,
        cc,
        cliente: draft.cliente,
        kind: draft.kind,
        ok: sendResult.ok,
        messageId: sendResult.data?.id ?? null,
        cufe: factura.cufe,
        cufeSimulado: factura.simulated,
        simulatedFields: draft.simulatedFields,
      },
      reason: sendResult.ok ? null : sendResult.error,
    });

    if (!sendResult.ok) {
      throw new BadRequestException(`No se pudo enviar el correo de facturación: ${sendResult.error ?? 'error desconocido'}`);
    }

    this.logger.log(`Orden ${numberOrderSales} (${draft.cliente}): borrador de facturación enviado a ${primaryTo}.`);
    return { sent: true, to: [primaryTo], cc, filename, cufe: factura.cufe, cufeSimulado: factura.simulated, simulated };
  }

  /**
   * Emite la factura electrónica UNA sola vez por orden (IdempotencyService,
   * mismo patrón que Liquidación): una factura emitida no se re-emite — los
   * reintentos del correo y las descargas reusan el mismo CUFE.
   */
  private async emitirFacturaElectronica(draft: FacturacionDraft): Promise<FacturaElectronica> {
    const tenantId = this.ctx.tenantId;
    const key = `facturacion:dian:${draft.numberOrderSales}`;

    // Candado: jamás una factura electrónica REAL con datos simulados.
    const { mode } = await this.hub.capabilities('dian');
    if (mode === 'real' && draft.simulated) {
      throw new BadRequestException({
        message: `No se emite una factura electrónica real con datos SIMULADOS (${draft.simulatedFields.join(', ')}). Digita esos datos o espera la fuente real.`,
        simulatedFields: draft.simulatedFields,
      });
    }

    const claim = await this.idempotency.claim<FacturaElectronica & { ambiguous?: boolean }>(
      tenantId,
      'facturacion_dian',
      key,
      DIAN_IDEMPOTENCY_TTL_MS,
    );
    if (!claim.claimed) {
      if (claim.existingStatus === 'completed' && claim.existingResult?.cufe) return claim.existingResult;
      if (claim.existingStatus === 'processing') {
        throw new ConflictException(`La factura electrónica de la orden ${draft.numberOrderSales} se está emitiendo en este momento.`);
      }
      // failed: con un proveedor REAL, un fallo ambiguo (timeout) pudo haber
      // emitido la factura — no se reintenta a ciegas.
      if (claim.existingResult?.ambiguous && mode === 'real') {
        throw new ConflictException(
          `El último intento de emitir la factura de la orden ${draft.numberOrderSales} fue ambiguo (timeout/red): pudo haberse emitido. Verifica con el proveedor DIAN antes de reintentar.`,
        );
      }
      if (!(await this.idempotency.reclaimFailed(tenantId, key))) {
        throw new ConflictException(`Otra solicitud ya está emitiendo la factura de la orden ${draft.numberOrderSales}.`);
      }
    }

    const invoiceNumber = `OV${draft.numberOrderSales}`;
    const res = await this.hub.call<Record<string, unknown>>(
      'dian',
      'invoice.send',
      {
        invoiceNumber,
        totalAmount: draft.totalValor,
        cliente: draft.cliente,
        pais: draft.pais,
        tipoPedido: draft.kind,
        direccionEntrega: draft.direccionEntrega,
        lineas: draft.lines.map((l) => ({ tipoPelicula: l.tipoPelicula, kilos: l.kilosTotal, precio: l.precio, valor: l.valorLinea })),
      },
      DIAN_WRITE_OPTIONS,
    );
    const cufe = res.ok ? text(res.data?.cufe) : null;
    if (!cufe) {
      // OK sin CUFE = pudo haberse emitido sin que sepamos su identificador: ambiguo.
      const error = res.ok ? 'la respuesta no trae CUFE' : (res.error ?? 'error desconocido');
      const ambiguous = res.ok || isAmbiguous(res.error);
      await this.idempotency.saveProgress(tenantId, key, { ambiguous, lastError: error });
      await this.idempotency.markFailed(tenantId, key, error);
      await this.audit.log({
        workflowName: WORKFLOW_NAME,
        action: 'facturacion_dian_fallida',
        entityType: 'facturacion',
        entityId: String(draft.numberOrderSales),
        actorId: this.ctx.userId,
        outputData: { invoiceNumber, ambiguous, mode: res.mode },
        reason: error,
      });
      throw new BadRequestException(`No se pudo emitir la factura electrónica de la orden ${draft.numberOrderSales}: ${error}`);
    }

    const factura: FacturaElectronica = {
      invoiceNumber: text(res.data?.invoiceNumber) ?? invoiceNumber,
      cufe,
      status: text(res.data?.status) ?? 'desconocido',
      simulated: res.mode === 'mock' || res.data?.simulated === true,
      emitidaEn: text(res.data?.dianReceivedAt),
    };
    await this.idempotency.markCompleted(tenantId, key, factura);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      action: 'facturacion_dian_emitida',
      entityType: 'facturacion',
      entityId: String(draft.numberOrderSales),
      actorId: this.ctx.userId,
      outputData: { ...factura },
    });
    return factura;
  }

  /** Emisión previa (si la hubo), para mostrarla al descargar el PDF sin emitir nada. */
  private async facturaElectronicaEmitida(numberOrderSales: number): Promise<FacturaElectronica | null> {
    const events = await this.audit.listForEntity('facturacion', String(numberOrderSales));
    const last = [...events].reverse().find((e) => e.action === 'facturacion_dian_emitida');
    const o = last?.outputData;
    const cufe = text(o?.cufe);
    if (!o || !cufe) return null;
    return {
      invoiceNumber: text(o.invoiceNumber) ?? `OV${numberOrderSales}`,
      cufe,
      status: text(o.status) ?? 'desconocido',
      simulated: o.simulated !== false,
      emitidaEn: text(o.emitidaEn),
    };
  }

  private emailBody(draft: FacturacionDraft, factura: FacturaElectronica): string {
    const simulatedData = draft.simulated || factura.simulated;
    const parts = [
      `<p>Adjunto el borrador de facturación de la orden ${draft.numberOrderSales} (${draft.cliente}), armado con datos reales del sistema de Oben${simulatedData ? ' y los datos SIMULADOS que se indican abajo' : ''}, para revisión de Facturación/COMEX.</p>`,
      factura.simulated
        ? `<p><strong>CUFE SIMULADO — pendiente de proveedor DIAN real:</strong> ${factura.cufe}. Este documento no tiene validez fiscal.</p>`
        : `<p>Factura electrónica ${factura.invoiceNumber} — CUFE ${factura.cufe}.</p>`,
    ];
    if (draft.simulatedFields.includes('direccionEntrega')) {
      parts.push(`<p><strong>Dirección de entrega SIMULADA (Oben+ aún sin API real):</strong> ${draft.direccionEntrega}</p>`);
    }
    if (draft.simulatedFields.includes('pedido') || draft.simulatedFields.includes('precios')) {
      parts.push('<p><strong>Datos del pedido y precios SIMULADOS</strong> (el sistema de Oben está en modo simulador en este entorno).</p>');
    }
    return parts.join('');
  }

  private async fetchObenPlusAddress(numberPF: string): Promise<{ direccion: string; simulated: boolean } | null> {
    const res = await this.hub.call<Record<string, unknown>>('obenPlus', 'proforma.status', { numberPF }, OBEN_QUERY_OPTIONS);
    const direccion = res.ok ? text(res.data?.direccionEntrega) : null;
    if (!direccion) return null;
    return { direccion, simulated: res.mode === 'mock' || res.data?.simulated === true };
  }

  private async fetchHeader(numberOrderSales: number): Promise<EmpaqueUnificadaHeader | null> {
    const res = await this.hub.call<Record<string, unknown>>(
      'obenCostOrder',
      'query.run',
      { procedure: 'spEmpaqueUnificada_Paradixe', numberOrderSales },
      OBEN_QUERY_OPTIONS,
    );
    if (!res.ok || !res.data || typeof res.data !== 'object') return null;
    const d = res.data as Record<string, unknown>;
    const cliente = text(d.Cliente);
    if (!cliente) return null;
    return {
      simulated: res.mode === 'mock',
      Cliente: cliente,
      Pais: text(d.Pais),
      CodigoMaterial: text(d.CodigoMaterial),
      Contenedor: text(d.Contenedor),
      Proforma: text(d.Proforma),
      OrdenCompra: text(d.OrdenCompra),
    };
  }

  private async fetchCheckSettlement(numberPF: string): Promise<{ check: CheckSettlementResponse; simulated: boolean } | null> {
    const res = await this.hub.call<CheckSettlementResponse>(
      'obenCostOrder',
      'liquidacion.consultar',
      { numberPF },
      OBEN_QUERY_OPTIONS,
    );
    if (!res.ok) return null;
    const d = res.data as Partial<CheckSettlementResponse> | null | undefined;
    if (!d || typeof d !== 'object' || !Array.isArray(d.Detalle) || d.Detalle.length === 0) return null;
    for (const l of d.Detalle) {
      if (!isNum(toNum(l.CodSed_LineFilm)) || !isNum(toNum(l.KilosTotales)) || !isNum(toNum(l.Precio))) return null;
    }
    return { check: d as CheckSettlementResponse, simulated: res.mode === 'mock' };
  }
}
