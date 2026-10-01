import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { envioDeCatalogo } from '../distribution-lists/envios-catalogo';
import { ObenReportsService, type PackageAttachment } from '../oben-reports/oben-reports.service';
import { origenDatosOben } from '../oben-reports/origen-datos';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { FormatosService, renderEnvio } from '../formatos/formatos.service';

export interface EnvioManualResultado {
  enviado: true;
  lista: string;
  documento: string;
  ov: number;
  para: string[];
  copia: string[];
  adjuntos: string[];
  noIncluidos: string[];
}

/**
 * "Enviar ahora" de una lista de distribución (WO-026): el dueño escoge uno
 * de los documentos asociados a SU lista y una OV, y el correo sale solo a
 * los destinatarios de esa lista, con datos consultados en vivo a Oben.
 *
 * Reglas:
 * - Solo administración o un dueño de la lista (`asegurarGestion`).
 * - Solo documentos asociados a la lista y marcados como enviables a mano.
 * - La Lista de Empaque sale COMPLETA o no sale (igual que el envío automático).
 * - No confirma nada a Oben (`confirmApproveComex` es solo del flujo automático).
 */
@Injectable()
export class EnvioManualService {
  private readonly logger = new Logger(EnvioManualService.name);

  constructor(
    private readonly listas: DistributionListsService,
    private readonly reports: ObenReportsService,
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    @Optional() private readonly formatos?: FormatosService,
  ) {}

  async enviar(listaId: string, clave: string, ov: number): Promise<EnvioManualResultado> {
    const lista = await this.listas.asegurarGestion(listaId);
    const envio = envioDeCatalogo(clave);
    if (!envio) throw new BadRequestException(`"${clave}" no es un documento conocido.`);
    if (!envio.manual) {
      throw new BadRequestException(`"${envio.label}" no se envía a mano: ${envio.descripcion}`);
    }
    if (!lista.associations.some((a) => a.entityType === 'document' && a.entityKey === clave)) {
      throw new BadRequestException(`La lista "${lista.name}" no tiene asociado "${envio.label}".`);
    }
    const para = lista.recipients.filter((r) => r.role === 'to').map((r) => r.email);
    const copia = lista.recipients.filter((r) => r.role === 'cc').map((r) => r.email);
    const oculta = lista.recipients.filter((r) => r.role === 'bcc').map((r) => r.email);
    if (para.length === 0) throw new BadRequestException(`La lista "${lista.name}" no tiene destinatarios "Para".`);

    const { adjuntos, noIncluidos, simulado, cliente } = await this.armar(clave, ov);
    const origen = origenDatosOben(simulado);
    const correo = await renderEnvio(
      this.formatos,
      clave,
      { ov, cliente, reporte: envio.label, sufijo: adjuntos.some((a) => a.key === 'empaque_solefilmes') ? ' (Solefilmes)' : '', origen: origen.frase },
      simulado,
    );
    const lista_html =
      adjuntos.length > 1 ? `<ul>${adjuntos.map((a) => `<li>${escapeHtml(a.label)}</li>`).join('')}</ul>` : '';
    const faltan_html = noIncluidos.length
      ? `<p>No se pudieron incluir (${noIncluidos.length}): ${noIncluidos.map(escapeHtml).join(', ')}.</p>`
      : '';

    const [principal, ...resto] = para;
    const cc = [...resto, ...copia];
    const res = await this.hub.call<{ id: string }>(
      'email',
      'send',
      {
        to: principal,
        ...(cc.length ? { cc: cc.join(',') } : {}),
        ...(oculta.length ? { bcc: oculta.join(',') } : {}),
        subject: `${origen.prefijoAsunto}${correo.asunto}`,
        body: `${correo.cuerpoHtml}${lista_html}${faltan_html}`,
        attachments: adjuntos.map((a) => ({
          filename: a.filename,
          content: a.buffer.toString('base64'),
          encoding: 'base64',
          contentType: a.contentType,
        })),
      },
      { maxAttempts: 1, timeoutMs: 30_000 },
    );

    await this.audit.log({
      workflowName: 'distribution-lists',
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'lista_envio_manual',
      entityType: 'distribution_list',
      entityId: lista.id,
      actorId: this.ctx.userId,
      inputData: { lista: lista.name, documento: clave, ov },
      outputData: { ok: res.ok, para, cc: copia, bcc: oculta.length, adjuntos: adjuntos.map((a) => a.key), noIncluidos, messageId: res.data?.id ?? null },
      reason: res.ok ? null : res.error,
    });
    if (!res.ok) throw new BadRequestException(res.error ?? 'No se pudo enviar el correo.');
    this.logger.log(`Lista "${lista.name}": ${clave} de la OV ${ov} enviado a mano a ${para.length + copia.length + oculta.length} destinatarios.`);
    return {
      enviado: true,
      lista: lista.name,
      documento: envio.label,
      ov,
      para,
      copia,
      adjuntos: adjuntos.map((a) => a.filename),
      noIncluidos,
    };
  }

  private async armar(
    clave: string,
    ov: number,
  ): Promise<{ adjuntos: PackageAttachment[]; noIncluidos: string[]; simulado: boolean; cliente: string }> {
    if (clave === 'packing_list' || clave === 'document_package') {
      const p = await this.reports.buildDocumentPackage(ov);
      if (p.included.length === 0) throw new BadRequestException(`Oben no devolvió ningún documento para la OV ${ov}.`);
      if (clave === 'packing_list' && p.failed.length > 0) {
        throw new BadRequestException(
          `La Lista de Empaque de la OV ${ov} está incompleta (faltan: ${p.failed.map((f) => f.label).join(', ')}); no se envía incompleta.`,
        );
      }
      return { adjuntos: p.included, noIncluidos: p.failed.map((f) => f.label), simulado: p.simulated === true, cliente: p.client };
    }
    const r = await this.reports.buildReport(clave, ov);
    if (!r.ok) throw new BadRequestException(`${r.failure.label} de la OV ${ov}: ${r.failure.error}`);
    return { adjuntos: [r.attachment], noIncluidos: [], simulado: r.simulated, cliente: '' };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
