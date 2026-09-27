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

interface EmpaqueUnificadaHeader {
  Cliente: string;
  Pais: string;
  CodigoMaterial?: string;
  Contenedor?: string;
  Proforma?: string;
  OrdenCompra?: string;
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

    const cliente = header?.Cliente?.trim() || '';
    const pais = header?.Pais?.trim() || null;
    const proforma = header?.Proforma?.trim() || null;

    if (!header) missing.push('Datos del pedido: no se pudo consultar spEmpaqueUnificada_Paradixe en Oben.');
    if (header && !pais) missing.push('País de destino: la respuesta de Oben no lo trae.');
    if (header && !proforma) missing.push('Proforma: la respuesta de Oben no la trae — sin ella no se pueden traer precios por película.');

    const kind: FacturacionKind = isColombia(pais) ? (input.parcial ? 'nacional_parcial' : 'nacional_completo') : 'exportacion';

    let lines: FacturacionLine[] = [];
    if (proforma) {
      const check = await this.fetchCheckSettlement(proforma);
      if (!check) {
        missing.push(`Precios por película: no se pudo consultar spCheckSettlement_Paradixe para la Proforma ${proforma}.`);
      } else {
        lines = check.Detalle.map((l) => {
          const precio = Number(l.Precio);
          const kilosTotal = Number(l.KilosTotales);
          return {
            codSecLineFilm: Number(l.CodSed_LineFilm),
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
    if (!direccionEntrega && cliente) {
      const match = await this.clients.findOne({ where: { tenantId: this.ctx.tenantId, name: ILike(cliente) } });
      if (match?.address) {
        direccionEntrega = match.address;
        direccionFuente = 'maestro_clientes';
      }
    }
    if (kind === 'exportacion' && !direccionEntrega) {
      missing.push('Dirección de entrega: sin fuente de datos confirmada (pendiente por definir con Oben) — requerida para Exportación.');
    }

    const totalValor = round2(lines.reduce((a, l) => a + l.valorLinea, 0));
    const totalKilos = round2(lines.reduce((a, l) => a + l.kilosTotal, 0));

    return {
      numberOrderSales,
      cliente,
      pais,
      proforma,
      ordenCompra: header?.OrdenCompra?.trim() || null,
      contenedor: header?.Contenedor?.trim() || null,
      codigoMaterial: header?.CodigoMaterial?.trim() || null,
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
      const events = await this.audit.listForEntity('facturacion', String(numberOrderSales));
      if (events.some((e) => e.action === 'facturacion_enviada')) {
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
    if (!d.Cliente) return null;
    return d as unknown as EmpaqueUnificadaHeader;
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
      if (!isNum(Number(l.CodSed_LineFilm)) || !isNum(Number(l.KilosTotales)) || !isNum(Number(l.Precio))) return null;
    }
    return d as CheckSettlementResponse;
  }
}
