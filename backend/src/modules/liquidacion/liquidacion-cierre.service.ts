import { BadRequestException, ConflictException, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { ComercialCase } from '../../entities/comercial-case.entity';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { ObenReportsService, OBEN_QUERY_OPTIONS } from '../oben-reports/oben-reports.service';
import type { CierreAdjunto, CierreEnvioResult, CierrePreview } from './liquidacion.types';

const WORKFLOW_NAME = 'liquidacion';
/** Lista de distribución del correo de cierre: COMEX y Facturación (OBEN MAS §1.2). */
export const CIERRE_DISTRIBUTION_KEY = 'liquidacion_cierre';
export const PROFORMA_SIMULADA_LABEL = 'Proforma: PDF SIMULADO desde Oben+ — NO es el documento oficial de OBEN MAS (pendiente de su API)';
export const PROFORMA_FIRMADA_SIMULADA_LABEL = 'Proforma aprobada por el cliente: viene de un caso comercial SIMULADO (datos de prueba)';
export const UNIFICADA_SIMULADA_LABEL = 'Lista de Empaque Unificada: datos del SIMULADOR de Oben (este entorno no está conectado al sistema real)';

const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;

interface Adjunto extends CierreAdjunto {
  buffer: Buffer;
  contentType: string;
  /** 'cliente' = la Proforma que el cliente devolvió aprobada (caso comercial); 'obenPlus' = el PDF de OBEN MAS. */
  origen?: 'cliente' | 'obenPlus';
}

interface Preparado {
  preview: CierrePreview;
  adjuntos: Adjunto[];
  liquidacionSimulada: boolean;
}

/**
 * Correo de cierre de Liquidación (OBEN MAS §1.2): "una vez finalizada la
 * liquidación, el sistema deberá generar y enviar automáticamente un correo
 * dirigido a COMEX y Facturación informando que el proceso ha concluido",
 * con la Lista de Empaque Unificada y la Proforma adjuntas.
 *
 * - Lista Unificada: real (spEmpaqueUnificada vía obenCostOrder).
 * - Proforma: `obenPlus` → `proforma.pdf`. Hoy es un SIMULADOR (Oben aún no
 *   expone el PDF oficial); cuando exista el adapter real se conecta sin
 *   tocar este servicio.
 *
 * Candados — este correo NUNCA presenta algo simulado como real:
 *  1. Solo sale si la liquidación CONCLUYÓ en Oben (evento
 *     `liquidacion_completada`), y nunca si esa liquidación fue simulada.
 *  2. Todo adjunto simulado lleva `[SIMULADO]` en el asunto y su rótulo en el
 *     cuerpo; `assertRotulado` lo verifica antes de enviar.
 *  3. Nunca incompleto: si falta un adjunto o la lista de distribución, no
 *     sale y queda en `missing`.
 *  4. Un solo envío por PF salvo `force` (mismo criterio que Facturación).
 */
@Injectable()
export class LiquidacionCierreService {
  private readonly logger = new Logger(LiquidacionCierreService.name);

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    private readonly distributionLists: DistributionListsService,
    private readonly reports: ObenReportsService,
    @Optional() @InjectRepository(ComercialCase) private readonly casos?: Repository<ComercialCase>,
  ) {}

  /** Qué saldría y si puede salir — no envía nada. */
  async preview(numberPF: string): Promise<CierrePreview> {
    return (await this.preparar(this.parsePF(numberPF))).preview;
  }

  async enviar(numberPF: string, options: { force?: boolean } = {}): Promise<CierreEnvioResult> {
    const pf = this.parsePF(numberPF);
    const { preview, adjuntos, liquidacionSimulada } = await this.preparar(pf);

    if (!preview.liquidacionCompletada) {
      throw new BadRequestException(
        `La liquidación de la PF ${pf} no ha concluido en Oben: el correo de cierre solo sale cuando la liquidación se completó (nunca tras una simulación).`,
      );
    }
    if (liquidacionSimulada) {
      throw new BadRequestException(`La liquidación de la PF ${pf} se armó con datos SIMULADOS: no se anuncia como concluida.`);
    }
    if (preview.yaEnviado && !options.force) {
      throw new ConflictException(`Ya se envió el correo de cierre de la PF ${pf}. Usa force:true si de verdad quieres reenviarlo.`);
    }
    if (preview.missing.length > 0) {
      await this.audit.log({
        workflowName: WORKFLOW_NAME,
        action: 'liquidacion_cierre_incompleto',
        entityType: 'liquidacion',
        entityId: pf,
        actorId: this.ctx.userId,
        outputData: { missing: preview.missing },
        reason: 'No se envía el correo de cierre con documentos o destinatarios faltantes.',
      });
      throw new BadRequestException({
        message: `El correo de cierre de la PF ${pf} no se envía incompleto.`,
        missing: preview.missing,
      });
    }

    const body = this.body(preview);
    this.assertRotulado(preview.asunto!, body, preview.adjuntos, preview.simulatedItems);
    const [primaryTo, ...restTo] = preview.destinatarios.to;
    const cc = [...restTo, ...preview.destinatarios.cc];

    const res = await this.hub.call<{ id: string }>(
      'email',
      'send',
      {
        to: primaryTo,
        ...(cc.length ? { cc: cc.join(',') } : {}),
        subject: preview.asunto,
        body,
        attachments: adjuntos.map((a) => ({
          filename: a.filename,
          content: a.buffer.toString('base64'),
          encoding: 'base64',
          contentType: a.contentType,
        })),
      },
      { maxAttempts: 1, timeoutMs: 30_000 },
    );

    const adjuntosPublicos = preview.adjuntos;
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'liquidacion_cierre_enviado',
      entityType: 'liquidacion',
      entityId: pf,
      actorId: this.ctx.userId,
      outputData: {
        to: primaryTo,
        cc,
        ok: res.ok,
        messageId: res.data?.id ?? null,
        adjuntos: adjuntosPublicos,
        simulated: preview.simulated,
        force: !!options.force,
      },
      reason: res.ok ? null : (res.error ?? 'error desconocido'),
    });
    if (!res.ok) {
      throw new BadRequestException(`No se pudo enviar el correo de cierre de la PF ${pf}: ${res.error ?? 'error desconocido'}`);
    }
    this.logger.log(`PF ${pf}: correo de cierre de Liquidación enviado a ${primaryTo}${preview.simulated ? ' (con adjuntos SIMULADOS rotulados)' : ''}.`);
    return {
      sent: true,
      numberPF: pf,
      to: [primaryTo],
      cc,
      adjuntos: adjuntosPublicos,
      simulated: preview.simulated,
      messageId: res.data?.id ?? null,
    };
  }

  /**
   * Disparo automático al completar una liquidación (LiquidacionService). La
   * liquidación YA quedó creada en Oben: un fallo del correo nunca la hace
   * fallar — se devuelve (y queda auditado) para reintentarlo con
   * `POST /liquidacion/:numberPF/cierre`.
   */
  async enviarTrasCompletar(numberPF: string): Promise<CierreEnvioResult> {
    try {
      return await this.enviar(numberPF);
    } catch (err) {
      const response = (err as { getResponse?: () => unknown }).getResponse?.() as { missing?: string[] } | undefined;
      const error = (err as Error).message;
      this.logger.warn(`PF ${numberPF}: la liquidación concluyó pero el correo de cierre no salió: ${error}`);
      return {
        sent: false,
        numberPF,
        to: [],
        cc: [],
        adjuntos: [],
        simulated: false,
        ...(response?.missing ? { missing: response.missing } : {}),
        error,
      };
    }
  }

  private async preparar(pf: string): Promise<Preparado> {
    const missing: string[] = [];
    const events = await this.audit.listForEntity('liquidacion', pf);
    const completion = [...events].reverse().find((e) => e.action === 'liquidacion_completada');
    const done = completion?.outputData ?? null;
    const yaEnviado = events.some((e) => e.action === 'liquidacion_cierre_enviado' && e.outputData?.ok !== false);
    const liquidacionSimulada = done?.simulated === true;

    let ordenVenta = text(done?.ordenVenta);
    let cliente = text(done?.cliente);
    if (!ordenVenta) {
      // Liquidaciones completadas antes de guardar la OV en el evento, o vista
      // previa antes de liquidar: se resuelve desde spCheckSettlement.
      const check = await this.hub.call<Record<string, unknown>>('obenCostOrder', 'liquidacion.consultar', { numberPF: pf }, OBEN_QUERY_OPTIONS);
      ordenVenta = check.ok ? text(check.data?.OrdenVenta) : null;
      cliente ??= check.ok ? text(check.data?.Cliente) : null;
      if (!ordenVenta) missing.push(`Orden de venta de la PF ${pf}: no se pudo resolver en Oben (spCheckSettlement).`);
    }

    const destinatarios = await this.distributionLists.resolveRecipients('document', CIERRE_DISTRIBUTION_KEY);
    if (destinatarios.to.length === 0) {
      missing.push(`Destinatarios: no hay ninguna lista de distribución asociada a "${CIERRE_DISTRIBUTION_KEY}" (COMEX y Facturación) — configúrala en Listas de Distribución.`);
    }

    const adjuntos: Adjunto[] = [];
    const ov = ordenVenta ? Number(ordenVenta) : NaN;
    if (Number.isInteger(ov) && ov > 0) {
      const unificada = await this.reports.buildReport('empaque_unificada', ov);
      if (unificada.ok) {
        adjuntos.push({
          key: 'empaque_unificada',
          label: unificada.attachment.label,
          filename: unificada.attachment.filename,
          contentType: unificada.attachment.contentType,
          buffer: unificada.attachment.buffer,
          simulated: unificada.simulated,
        });
      } else {
        missing.push(`Lista de Empaque Unificada (OV ${ov}): ${unificada.failure.error}`);
      }
    }

    const proforma = await this.fetchProformaPdf(pf);
    if ('error' in proforma) missing.push(proforma.error);
    else adjuntos.push(proforma);

    const simulatedItems = [
      ...(adjuntos.some((a) => a.key === 'proforma' && a.simulated && a.origen !== 'cliente') ? [PROFORMA_SIMULADA_LABEL] : []),
      ...(adjuntos.some((a) => a.key === 'proforma' && a.simulated && a.origen === 'cliente') ? [PROFORMA_FIRMADA_SIMULADA_LABEL] : []),
      ...(adjuntos.some((a) => a.key === 'empaque_unificada' && a.simulated) ? [UNIFICADA_SIMULADA_LABEL] : []),
    ];
    const simulated = simulatedItems.length > 0;
    const liquidacionCompletada = !!completion;
    const preview: CierrePreview = {
      numberPF: pf,
      ordenVenta,
      cliente,
      liquidacionCompletada,
      headId: typeof done?.headId === 'number' ? done.headId : null,
      detalles: typeof done?.details === 'number' ? done.details : null,
      destinatarios: { to: destinatarios.to, cc: destinatarios.cc },
      asunto: `${simulated ? '[SIMULADO] ' : ''}Liquidación concluida — PF ${pf}${ordenVenta ? ` / OV ${ordenVenta}` : ''}`,
      adjuntos: adjuntos.map(({ key, label, filename, simulated: s }) => ({ key, label, filename, simulated: s })),
      simulated,
      simulatedItems,
      missing,
      yaEnviado,
      puedeEnviar: liquidacionCompletada && !liquidacionSimulada && missing.length === 0 && !yaEnviado,
    };
    return { preview, adjuntos, liquidacionSimulada };
  }

  /**
   * OBEN MAS §1.2: la Proforma adjunta es la "aprobada por el cliente". Si el
   * flujo Comercial la recibió (respuesta del cliente con la Proforma
   * firmada), va esa; si no, el PDF de la Proforma desde OBEN MAS.
   */
  private async fetchProformaPdf(pf: string): Promise<Adjunto | { error: string }> {
    const firmada = await this.proformaFirmada(pf);
    if (firmada) return firmada;
    const res = await this.hub.call<Record<string, unknown>>('obenPlus', 'proforma.pdf', { numberPF: pf }, OBEN_QUERY_OPTIONS);
    if (!res.ok) return { error: `Proforma ${pf}: no se pudo obtener el PDF de Oben+ (${res.error ?? 'error desconocido'}).` };
    const base64 = text(res.data?.contentBase64);
    const buffer = base64 ? Buffer.from(base64, 'base64') : null;
    if (!buffer || buffer.subarray(0, 4).toString() !== '%PDF') {
      return { error: `Proforma ${pf}: Oben+ no devolvió un PDF válido.` };
    }
    const simulated = res.mode === 'mock' || res.data?.simulated === true;
    return {
      key: 'proforma',
      label: 'Proforma',
      // El nombre del archivo lo fija este servicio: un PDF simulado siempre se llama "SIMULADA".
      filename: simulated ? `Proforma_SIMULADA-PF${pf}.pdf` : (text(res.data?.filename) ?? `Proforma-PF${pf}.pdf`),
      contentType: 'application/pdf',
      buffer,
      simulated,
      origen: 'obenPlus',
    };
  }

  private async proformaFirmada(pf: string): Promise<Adjunto | null> {
    if (!this.casos) return null;
    const caso = await this.casos
      .createQueryBuilder('c')
      .addSelect('c.proformaFirmada')
      .where('c.tenant_id = :t AND c.number_pf = :pf AND c.proforma_firmada IS NOT NULL', { t: this.ctx.tenantId, pf })
      .orderBy('c.updated_at', 'DESC')
      .getOne();
    const buffer = caso?.proformaFirmada ?? null;
    if (!caso || !buffer || buffer.subarray(0, 4).toString() !== '%PDF') return null;
    const simulated = caso.simulated;
    return {
      key: 'proforma',
      label: 'Proforma aprobada por el cliente',
      filename: simulated ? `Proforma_aprobada_SIMULADA-PF${pf}.pdf` : (caso.proformaFirmadaNombre ?? `Proforma_aprobada-PF${pf}.pdf`),
      contentType: 'application/pdf',
      buffer,
      simulated,
      origen: 'cliente',
    };
  }

  private body(p: CierrePreview): string {
    const lineas = p.adjuntos
      .map((a) => `<li>${a.label} — ${a.filename}${a.simulated ? ' <strong>(SIMULADO)</strong>' : ''}</li>`)
      .join('');
    const detalle = p.headId !== null ? ` Encabezado ${p.headId}${p.detalles !== null ? `, ${p.detalles} línea(s) de detalle` : ''}.` : '';
    return [
      `<p>La liquidación de la Proforma ${p.numberPF}${p.ordenVenta ? ` (OV ${p.ordenVenta}` : ''}${p.cliente ? `, ${p.cliente}` : ''}${p.ordenVenta ? ')' : ''} concluyó en Oben.${detalle}</p>`,
      `<p>Adjuntos:</p><ul>${lineas}</ul>`,
      ...(p.simulated
        ? [`<p><strong>ATENCIÓN — este correo lleva documentos SIMULADOS:</strong></p><ul>${p.simulatedItems.map((i) => `<li>${i}</li>`).join('')}</ul>`]
        : []),
    ].join('');
  }

  /** Candado estructural: si algo es simulado, el asunto y el cuerpo DEBEN decirlo. */
  private assertRotulado(asunto: string, body: string, adjuntos: CierreAdjunto[], simulatedItems: string[]): void {
    const simulados = adjuntos.filter((a) => a.simulated);
    if (simulados.length === 0) return;
    const ok =
      asunto.startsWith('[SIMULADO]') &&
      body.includes('documentos SIMULADOS') &&
      simulatedItems.every((i) => body.includes(i)) &&
      simulados.every((a) => body.includes(`${a.filename} <strong>(SIMULADO)</strong>`));
    if (!ok) throw new Error('Candado: el correo de cierre lleva documentos simulados sin rotular — no se envía.');
  }

  private parsePF(raw: string): string {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new BadRequestException('numberPF debe ser un número de Proforma válido');
    return String(n);
  }
}
