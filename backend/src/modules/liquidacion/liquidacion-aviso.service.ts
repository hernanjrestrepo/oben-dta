import { Injectable, Logger } from '@nestjs/common';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { LiquidacionService } from './liquidacion.service';
import { CIERRE_DISTRIBUTION_KEY } from './liquidacion-cierre.service';
import type { LiquidacionDraft } from './liquidacion.types';

/** Lista de distribución que recibe el aviso "liquidación lista para aprobar" (COMEX). */
export const APROBACION_DISTRIBUTION_KEY = 'liquidacion_aprobacion';

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Proceso de Oben (José, 7-oct): al llegar "OV Aprobada En Corte" de un pedido
 * de EXPORTACIÓN van Lista de Empaque → Liquidación → Factura. COMEX debe
 * aprobar la liquidación antes de enviarla a Oben (María, 6-oct), así que al
 * salir la Lista de Empaque el sistema arma la liquidación de la PF y avisa a
 * COMEX para que la apruebe. Nunca envía nada a Oben. Un aviso por PF.
 */
@Injectable()
export class LiquidacionAvisoService {
  private readonly logger = new Logger(LiquidacionAvisoService.name);

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    private readonly distributionLists: DistributionListsService,
    private readonly liquidacion: LiquidacionService,
  ) {}

  async avisarExportacion(numberOrderSales: number): Promise<{ estado: 'avisada' | 'omitida' | 'fallida'; motivo?: string; numberPF?: string }> {
    const omitir = async (motivo: string, pf?: string) => {
      await this.registrar('liquidacion_aviso_omitido', pf ?? String(numberOrderSales), numberOrderSales, motivo);
      return { estado: 'omitida' as const, motivo, numberPF: pf };
    };

    const h = await this.encabezadoDeOv(numberOrderSales);
    if (!h?.proforma) return omitir('Oben no devolvió la proforma de la orden.');
    if (/^col(ombia)?\b/i.test(h.pais)) return omitir('Pedido nacional: no lleva liquidación de exportación.', h.proforma);

    const previos = await this.audit.listForEntity('liquidacion', h.proforma);
    if (previos.some((e) => e.action === 'liquidacion_aviso_comex')) {
      return omitir(`Ya se avisó a COMEX la liquidación de la PF ${h.proforma}.`, h.proforma);
    }

    let destinatarios = await this.distributionLists.resolveRecipients('document', APROBACION_DISTRIBUTION_KEY);
    if (destinatarios.to.length === 0) destinatarios = await this.distributionLists.resolveRecipients('document', CIERRE_DISTRIBUTION_KEY);
    if (destinatarios.to.length === 0) {
      return omitir(`No hay lista de distribución "${APROBACION_DISTRIBUTION_KEY}" ni "${CIERRE_DISTRIBUTION_KEY}" para avisar a COMEX.`, h.proforma);
    }

    let draft: LiquidacionDraft | null = null;
    let errorDraft: string | null = null;
    try {
      draft = await this.liquidacion.getDraft(h.proforma);
    } catch (err) {
      errorDraft = (err as Error).message;
    }

    const [to, ...restTo] = destinatarios.to;
    const cc = [...restTo, ...destinatarios.cc];
    const res = await this.hub.call<{ id: string }>(
      'email',
      'send',
      {
        to,
        ...(cc.length ? { cc: cc.join(',') } : {}),
        subject: `${draft?.simulated ? '[SIMULADO] ' : ''}Liquidación para aprobar — PF ${h.proforma} / OV ${numberOrderSales}${draft?.cliente ? ` (${draft.cliente})` : ''}`,
        body: this.cuerpo(numberOrderSales, h.proforma, draft, errorDraft),
      },
      { maxAttempts: 1, timeoutMs: 30_000 },
    );
    if (!res.ok) {
      await this.registrar('liquidacion_aviso_fallido', h.proforma, numberOrderSales, res.error ?? 'error enviando el correo');
      return { estado: 'fallida', motivo: res.error ?? 'error enviando el correo', numberPF: h.proforma };
    }
    await this.audit.log({
      workflowName: 'liquidacion',
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'liquidacion_aviso_comex',
      entityType: 'liquidacion',
      entityId: h.proforma,
      actorId: this.ctx.userId,
      outputData: { ov: numberOrderSales, to, cc, readyToSubmit: draft?.readyToSubmit ?? false, faltantes: draft?.missing ?? [], errorDraft },
    });
    this.logger.log(`OV ${numberOrderSales}: liquidación de la PF ${h.proforma} avisada a COMEX para aprobación.`);
    return { estado: 'avisada', numberPF: h.proforma };
  }

  private cuerpo(ov: number, pf: string, d: LiquidacionDraft | null, errorDraft: string | null): string {
    const partes = [
      `<p>Salió la Lista de Empaque de la OV <b>${ov}</b> (exportación). La liquidación de la <b>PF ${pf}</b> está lista para que COMEX la revise y la apruebe en Oben Xmart → <b>Liquidación y Facturación</b> (OV ${ov}). Hasta que se apruebe no se envía nada a Oben.</p>`,
    ];
    if (!d) {
      partes.push(`<p><b>No se pudo armar la liquidación automáticamente:</b> ${esc(errorDraft ?? 'error desconocido')}. Ábrela en la pantalla para completarla.</p>`);
      return partes.join('');
    }
    const fob = d.lines.reduce((a, l) => a + (Number(l.valueFOB) || 0), 0);
    const seguro = d.lines.reduce((a, l) => a + (Number(l.valueSure) || 0), 0);
    const filas: Array<[string, string]> = [
      ['Cliente', d.cliente],
      ['País', d.pais ?? '—'],
      ['Incoterm', d.incoterm ?? '—'],
      ['Flete', typeof d.totales.flete === 'number' ? usd(d.totales.flete) : '—'],
      ['Seguro', usd(seguro)],
      ['Otros gastos', typeof d.totales.otrosGastos === 'number' ? usd(d.totales.otrosGastos) : '—'],
      ['FOB total', usd(fob)],
      ['Partida (Pa_Ncm)', String(d.header.paNcm ?? '—')],
    ];
    partes.push(
      `<table cellpadding="4" style="border-collapse:collapse;font-size:13px">${filas
        .map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`)
        .join('')}</table>`,
    );
    partes.push(
      d.missing.length
        ? `<p><b>Le falta para poder enviarla:</b></p><ul>${d.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
        : '<p>Tiene todos los datos: solo falta la aprobación de COMEX.</p>',
    );
    if (d.ajustes.length) partes.push(`<p style="color:#666;font-size:12px">Avisos: ${d.ajustes.map(esc).join(' · ')}</p>`);
    if (d.simulated) partes.push('<p><b>SIMULADO:</b> esta liquidación usa datos de ejemplo; no es real.</p>');
    return partes.join('');
  }

  private async encabezadoDeOv(numberOrderSales: number): Promise<{ pais: string; proforma: string } | null> {
    const r = await this.hub.call<unknown>(
      'obenCostOrder',
      'query.run',
      { procedure: 'spEmpaqueUnificada_Paradixe', numberOrderSales },
      { maxAttempts: 2, timeoutMs: 60_000 },
    );
    if (!r.ok) return null;
    const h = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!h || typeof h !== 'object') return null;
    const o = h as Record<string, unknown>;
    return { pais: String(o.Pais ?? '').trim(), proforma: String(o.Proforma ?? '').trim() };
  }

  private async registrar(action: string, entityId: string, ov: number, motivo: string): Promise<void> {
    await this.audit.log({
      workflowName: 'liquidacion',
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action,
      entityType: 'liquidacion',
      entityId,
      actorId: this.ctx.userId,
      outputData: { ov },
      reason: motivo,
    });
    this.logger.log(`OV ${ov}: aviso de liquidación a COMEX — ${motivo}`);
  }
}
