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
import type { CheckSettlementResponse } from '../liquidacion/liquidacion.types';
import type {
  FacturacionDocument,
  FacturacionDraft,
  FacturacionInput,
  FacturacionKind,
  FacturacionLine,
  FacturacionSendResult,
} from './facturacion.types';
import { FacturacionPdfService } from './facturacion-pdf.service';

const WORKFLOW_NAME = 'facturacion';
const round2 = (n: number) => Math.round(n * 100) / 100;
const isColombia = (pais: string | null) => !!pais && /^col(ombia)?\b/i.test(pais.trim());
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Número desde la respuesta de Oben: `Number(null)`/`Number('')` darían 0 — un precio o kilos ausente NO es 0. */
const toNum = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
/** ILIKE sin comodines: `%`/`_` en el nombre del cliente no deben emparejar a otro cliente. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

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
 * Deliberadamente NO dispara la facturación electrónica DIAN: no hay
 * proveedor definido (pregunta abierta con Oben) ni forma de generar un CUFE
 * real. Este servicio arma el borrador/PDF de apoyo para que Facturación/
 * COMEX lo revisen — el mismo principio de Liquidación aplica: nunca se
 * inventa un valor, lo que falta bloquea `readyToGenerate` y queda listado en
 * `missing`.
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

    let lines: FacturacionLine[] = [];
    if (proforma) {
      const check = await this.fetchCheckSettlement(proforma);
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
    if (kind === 'exportacion' && !direccionEntrega) {
      missing.push(
        direccionAmbigua
          ? `Dirección de entrega: hay más de un cliente "${cliente}" en el maestro de clientes — no se elige uno a ciegas; digítala.`
          : 'Dirección de entrega: sin fuente de datos confirmada (pendiente por definir con Oben) — requerida para Exportación.',
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
    };
  }

  async generateDocument(numberOrderSales: number, input: FacturacionInput = {}): Promise<FacturacionDocument> {
    const draft = await this.getDraft(numberOrderSales, input);
    if (!draft.readyToGenerate) {
      throw new BadRequestException({
        message: 'El documento de facturación no se puede generar todavía: faltan datos (no se inventan).',
        missing: draft.missing,
      });
    }
    const pdf = await this.pdf.build(draft);
    const filename = `Factura_Borrador-OV${numberOrderSales}.pdf`;
    return { draft, filename, pdf };
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

    const { draft, filename, pdf } = await this.generateDocument(numberOrderSales, input);
    const [primaryTo, ...restTo] = resolved.to;
    const cc = [...restTo, ...resolved.cc];

    const sendResult = await this.hub.call<{ id: string }>(
      'email',
      'send',
      {
        to: primaryTo,
        ...(cc.length ? { cc: cc.join(',') } : {}),
        subject: `Borrador de Facturación — Orden ${numberOrderSales}`,
        body: `<p>Adjunto el borrador de facturación de la orden ${numberOrderSales} (${draft.cliente}), armado con datos reales del sistema de Oben, para revisión de Facturación/COMEX.</p>`,
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
      outputData: { to: primaryTo, cc, cliente: draft.cliente, kind: draft.kind, ok: sendResult.ok, messageId: sendResult.data?.id ?? null },
      reason: sendResult.ok ? null : sendResult.error,
    });

    if (!sendResult.ok) {
      throw new BadRequestException(`No se pudo enviar el correo de facturación: ${sendResult.error ?? 'error desconocido'}`);
    }

    this.logger.log(`Orden ${numberOrderSales} (${draft.cliente}): borrador de facturación enviado a ${primaryTo}.`);
    return { sent: true, to: [primaryTo], cc, filename };
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
      Cliente: cliente,
      Pais: text(d.Pais),
      CodigoMaterial: text(d.CodigoMaterial),
      Contenedor: text(d.Contenedor),
      Proforma: text(d.Proforma),
      OrdenCompra: text(d.OrdenCompra),
    };
  }

  private async fetchCheckSettlement(numberPF: string): Promise<CheckSettlementResponse | null> {
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
    return d as CheckSettlementResponse;
  }
}
