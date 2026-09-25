import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { LiquidacionRatesService } from '../freight-rates/liquidacion-rates.service';
import { OBEN_QUERY_OPTIONS } from '../oben-reports/oben-reports.service';
import { LIQUIDACION_VALUE_CALCULATOR, type LiquidacionValueCalculator } from './liquidacion-value-calculator';
import type {
  CheckSettlementResponse,
  LiquidacionDraft,
  LiquidacionDraftLine,
  LiquidacionHeaderValues,
  LiquidacionInput,
  LiquidacionLineValues,
  LiquidacionProgress,
  LiquidacionSubmitOptions,
  LiquidacionSubmitResult,
} from './liquidacion.types';

const WORKFLOW_NAME = 'liquidacion';
/** Una liquidación es permanente: la clave de idempotencia no debe expirar nunca en la práctica. */
const IDEMPOTENCY_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;
/**
 * Las ESCRITURAS a Oben nunca se reintentan solas (maxAttempts:1): un
 * reintento tras un timeout puede duplicar un registro real en su ERP, que
 * no sabemos borrar. Mismo criterio que el envío de correos.
 */
const WRITE_OPTIONS = { maxAttempts: 1, timeoutMs: 60_000 };

const HEADER_REQUIRED: Array<[keyof LiquidacionHeaderValues, string]> = [
  ['direccion', 'Dirección'],
  ['puertoArribo', 'Puerto de arribo'],
  ['puertoEmbarque', 'Puerto de embarque'],
  ['paNcm', 'Partida arancelaria NCM'],
  ['paNaladi', 'Partida arancelaria NALADI'],
];
/** Solo cuando el destino es USA (José, 2026-09): vienen de la API de cargos que Oben aún debe crear. */
const HEADER_REQUIRED_USA: Array<[keyof LiquidacionHeaderValues, string]> = [
  ['inlandFreight', 'Inland Freight'],
  ['entryFee', 'Entry Fee'],
  ['importerSecurityFiling', 'Importer Security Filing'],
  ['harborMaintenanceFee', 'Harbor Maintenance Fee'],
  ['destinationCharges', 'Destination Charges'],
];
const LINE_REQUIRED: Array<[keyof LiquidacionLineValues, string]> = [
  ['kilosTotal', 'Kilos total'],
  ['kilosTotalUnit', 'Kilos total por unidad'],
  ['valueFOB', 'Valor FOB'],
  ['valueTotal', 'Valor total'],
  ['valueFreight', 'Valor flete'],
  ['valueFreightUnit', 'Valor flete por unidad'],
  ['valueSure', 'Valor seguro'],
  ['valueSureUnit', 'Valor seguro por unidad'],
  ['expensesOther', 'Otros gastos'],
  ['expensesOtherUnit', 'Otros gastos por unidad'],
  ['subTotal', 'Subtotal'],
  ['total', 'Total'],
  ['totalUnidad', 'Total por unidad'],
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const isUSA = (pais: string | null) =>
  !!pais && /^(usa|us|u\.s\.a?\.?|united states|estados unidos|eeuu)\b/i.test(pais.trim());
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

class LiquidacionStepError extends Error {
  constructor(
    message: string,
    readonly ambiguous: boolean,
  ) {
    super(message);
  }
}

/**
 * Proceso de Liquidación de comercio exterior (Oben Xmart) — ver las
 * respuestas de José del 2026-09-10. Flujo: consultar spCheckSettlement (por
 * Proforma) → armar borrador → el usuario confirma/edita dirección, puertos,
 * partidas y notas → crear encabezado (spSettlement_Head) → crear 1..n
 * detalles (spSettlement_Detail) con el id del encabezado.
 *
 * Principios: (1) NUNCA se inventa un valor — lo que no tiene fuente real
 * bloquea el envío y se lista en `missing`; (2) sin `confirm:true` solo se
 * simula; (3) una PF jamás se liquida dos veces (idempotencia + avance
 * persistido); (4) las escrituras a Oben no se reintentan solas.
 */
@Injectable()
export class LiquidacionService {
  private readonly logger = new Logger(LiquidacionService.name);

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    private readonly idempotency: IdempotencyService,
    private readonly rates: LiquidacionRatesService,
    @Inject(LIQUIDACION_VALUE_CALCULATOR)
    private readonly calculator: LiquidacionValueCalculator,
  ) {}

  async getDraft(numberPF: string, input: LiquidacionInput = {}): Promise<LiquidacionDraft> {
    const pf = this.parsePF(numberPF);
    const check = await this.fetchCheck(pf);
    const pais = await this.resolvePais(check.OrdenVenta);
    const esUSA = isUSA(pais);
    const missing: string[] = [];

    if (!pais) missing.push('País de destino: no se pudo resolver desde la orden de venta.');

    const baseLines = check.Detalle.map((l) => {
      const kilos = Number(l.KilosTotales);
      const precio = Number(l.Precio);
      return {
        codSecLineFilm: Number(l.CodSed_LineFilm),
        tipoPelicula: l.TipoPelicula,
        precio,
        kilosTotal: kilos,
        valueFOB: round2(precio * kilos),
      };
    });
    const totalFOB = round2(baseLines.reduce((a, l) => a + l.valueFOB, 0));
    const totalKilos = round2(baseLines.reduce((a, l) => a + l.kilosTotal, 0));

    // Encabezado: lo que digita/confirma el usuario manda; los cargos de USA
    // se toman del maestro de tarifas solo como valor por defecto.
    const header: LiquidacionHeaderValues = { ...(input.header ?? {}) };
    if (esUSA && pais) {
      const s = await this.rates.resolveSurcharges(this.ctx.tenantId, pais, totalFOB);
      header.entryFee ??= s.entryFee;
      header.importerSecurityFiling ??= s.importerSecurityFiling;
      header.harborMaintenanceFee ??= s.harborMaintenanceFee;
    }
    for (const [key, label] of HEADER_REQUIRED) {
      if (this.isBlank(header[key])) missing.push(`Encabezado — ${label}`);
    }
    if (esUSA) {
      for (const [key, label] of HEADER_REQUIRED_USA) {
        if (header[key] === undefined || header[key] === null) {
          missing.push(`Encabezado (destino USA) — ${label}`);
        }
      }
    }

    const lines: LiquidacionDraftLine[] = baseLines.map((l) => {
      const computed = this.calculator.compute({ pais, esUSA, header, line: l, totalFOB, totalKilos });
      const override = input.lines?.[String(l.codSecLineFilm)] ?? {};
      const values: LiquidacionLineValues = {
        kilosTotal: l.kilosTotal,
        valueFOB: l.valueFOB,
        ...computed,
        ...override,
      };
      for (const [key, label] of LINE_REQUIRED) {
        if (!isNum(values[key])) missing.push(`Línea ${l.codSecLineFilm} (${l.tipoPelicula}) — ${label}`);
      }
      return { codSecLineFilm: l.codSecLineFilm, tipoPelicula: l.tipoPelicula, precio: l.precio, ...values };
    });

    return {
      numberPF: pf,
      ordenVenta: check.OrdenVenta,
      ordenCompra: check.OrdenCompra,
      cliente: check.Cliente,
      pais,
      esUSA,
      header,
      lines,
      missing,
      readyToSubmit: missing.length === 0,
    };
  }

  async submit(
    numberPF: string,
    input: LiquidacionInput,
    options: LiquidacionSubmitOptions = {},
  ): Promise<LiquidacionSubmitResult> {
    const draft = await this.getDraft(numberPF, input);
    if (!draft.readyToSubmit) {
      throw new BadRequestException({
        message: 'La liquidación no se puede enviar todavía: faltan datos (no se inventan).',
        missing: draft.missing,
      });
    }
    const payloads = this.buildPayloads(draft);

    if (options.confirm !== true) {
      return { dryRun: true, numberPF: draft.numberPF, payloads };
    }

    const tenantId = this.ctx.tenantId;
    const key = `liquidacion:${draft.numberPF}`;
    let progress: LiquidacionProgress = { headId: null, detailsDone: [] };

    const claim = await this.idempotency.claim<LiquidacionProgress>(tenantId, 'liquidacion', key, IDEMPOTENCY_TTL_MS);
    if (!claim.claimed) {
      if (claim.existingStatus === 'completed') {
        return {
          dryRun: false,
          alreadyDone: true,
          numberPF: draft.numberPF,
          headId: claim.existingResult?.headId ?? undefined,
        };
      }
      if (claim.existingStatus === 'processing') {
        throw new ConflictException(`La PF ${draft.numberPF} ya se está liquidando en este momento.`);
      }
      // failed → solo se continúa con resume explícito
      const prev = claim.existingResult ?? { headId: null, detailsDone: [] };
      if (!options.resume) {
        throw new ConflictException({
          message: `La PF ${draft.numberPF} tiene una liquidación a medias. Verifica en Oben y reintenta con resume:true.`,
          progress: prev,
        });
      }
      if (prev.ambiguous && !options.acknowledgeAmbiguous) {
        throw new ConflictException({
          message:
            'El último fallo fue ambiguo (timeout/red): el registro pudo haberse creado en Oben. Verifica allí y reintenta con acknowledgeAmbiguous:true (y headId si el encabezado ya existe).',
          progress: prev,
        });
      }
      progress = { ...prev, ambiguous: false };
    }
    if (options.headId !== undefined) progress.headId = options.headId;

    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.WORKFLOW_STARTED,
      action: 'liquidacion_iniciada',
      entityType: 'liquidacion',
      entityId: draft.numberPF,
      actorId: this.ctx.userId,
      inputData: { resume: !!options.resume, lines: draft.lines.length },
    });

    try {
      if (progress.headId === null) {
        const head = await this.hub.call('obenCostOrder', 'liquidacion.crearEncabezado', payloads.header, WRITE_OPTIONS);
        if (!head.ok) {
          throw new LiquidacionStepError(`crearEncabezado: ${head.error ?? 'error desconocido'}`, this.isAmbiguous(head.error));
        }
        const headId = this.extractHeadId(head.data);
        progress.headResponse = head.data;
        if (headId === null) {
          // El encabezado SÍ se creó en Oben pero no sabemos su id: no se crean detalles a ciegas.
          throw new LiquidacionStepError(
            `crearEncabezado respondió OK pero no se pudo identificar CodSec_InvoiceDataComexHead en la respuesta: ${JSON.stringify(head.data).slice(0, 300)}`,
            true,
          );
        }
        progress.headId = headId;
        await this.idempotency.saveProgress(tenantId, key, progress);
        await this.audit.log({
          workflowName: WORKFLOW_NAME,
          action: 'liquidacion_encabezado_creado',
          entityType: 'liquidacion',
          entityId: draft.numberPF,
          actorId: this.ctx.userId,
          outputData: { headId },
        });
      }

      for (const detail of payloads.details) {
        const lineId = Number(detail.codSecLineFilm);
        if (progress.detailsDone.includes(lineId)) continue;
        const res = await this.hub.call(
          'obenCostOrder',
          'liquidacion.crearDetalle',
          { ...detail, codSecInvoiceDataComexHead: progress.headId },
          WRITE_OPTIONS,
        );
        if (!res.ok) {
          throw new LiquidacionStepError(
            `crearDetalle (línea ${lineId}): ${res.error ?? 'error desconocido'}`,
            this.isAmbiguous(res.error),
          );
        }
        progress.detailsDone.push(lineId);
        await this.idempotency.saveProgress(tenantId, key, progress);
      }
    } catch (err) {
      const e = err instanceof LiquidacionStepError ? err : new LiquidacionStepError((err as Error).message, true);
      progress.lastError = e.message;
      progress.ambiguous = e.ambiguous;
      await this.idempotency.saveProgress(tenantId, key, progress);
      await this.idempotency.markFailed(tenantId, key, e.message);
      await this.audit.log({
        workflowName: WORKFLOW_NAME,
        action: 'liquidacion_fallida',
        entityType: 'liquidacion',
        entityId: draft.numberPF,
        actorId: this.ctx.userId,
        outputData: { progress },
        reason: e.message,
      });
      this.logger.error(`Liquidación PF ${draft.numberPF} falló a medias: ${e.message}`);
      throw new BadRequestException({
        message: `La liquidación de la PF ${draft.numberPF} quedó a medias: ${e.message}`,
        progress,
      });
    }

    await this.idempotency.markCompleted(tenantId, key, progress);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.WORKFLOW_COMPLETED,
      action: 'liquidacion_completada',
      entityType: 'liquidacion',
      entityId: draft.numberPF,
      actorId: this.ctx.userId,
      outputData: { headId: progress.headId, details: progress.detailsDone.length },
    });
    return {
      dryRun: false,
      numberPF: draft.numberPF,
      headId: progress.headId ?? undefined,
      detailsCreated: progress.detailsDone.length,
    };
  }

  private buildPayloads(draft: LiquidacionDraft) {
    const header: Record<string, unknown> = { numberPF: draft.numberPF, ...draft.header };
    const details: Record<string, unknown>[] = draft.lines.map((l) => ({
      codSecLineFilm: l.codSecLineFilm,
      kilosTotal: l.kilosTotal,
      kilosTotalUnit: l.kilosTotalUnit,
      valueFOB: l.valueFOB,
      valueTotal: l.valueTotal,
      valueFreight: l.valueFreight,
      valueFreightUnit: l.valueFreightUnit,
      valueSure: l.valueSure,
      valueSureUnit: l.valueSureUnit,
      expensesOther: l.expensesOther,
      expensesOtherUnit: l.expensesOtherUnit,
      subTotal: l.subTotal,
      total: l.total,
      totalUnidad: l.totalUnidad,
    }));
    return { header, details };
  }

  private async fetchCheck(pf: string): Promise<CheckSettlementResponse> {
    const res = await this.hub.call<CheckSettlementResponse>(
      'obenCostOrder',
      'liquidacion.consultar',
      { numberPF: pf },
      OBEN_QUERY_OPTIONS,
    );
    if (!res.ok) throw new BadRequestException(res.error ?? 'No se pudo consultar la liquidación en Oben');
    const d = res.data as Partial<CheckSettlementResponse> | null | undefined;
    if (!d || typeof d !== 'object' || !Array.isArray(d.Detalle) || d.Detalle.length === 0 || !d.Proforma) {
      throw new BadRequestException(
        `Oben no devolvió datos de liquidación para la PF ${pf} (respuesta sin Proforma/Detalle).`,
      );
    }
    for (const l of d.Detalle) {
      if (!isNum(Number(l.CodSed_LineFilm)) || !isNum(Number(l.KilosTotales)) || !isNum(Number(l.Precio))) {
        throw new BadRequestException(`Línea de liquidación inválida para la PF ${pf}: ${JSON.stringify(l).slice(0, 200)}`);
      }
    }
    return d as CheckSettlementResponse;
  }

  private async resolvePais(ordenVenta: string): Promise<string | null> {
    const n = Number(ordenVenta);
    if (!Number.isFinite(n) || n <= 0) return null;
    const res = await this.hub.call<Record<string, unknown>>(
      'obenCostOrder',
      'query.run',
      { procedure: 'spEmpaqueUnificada_Paradixe', numberOrderSales: n },
      OBEN_QUERY_OPTIONS,
    );
    const pais = String((res.ok ? res.data : null)?.Pais ?? '').trim();
    return pais || null;
  }

  /** La respuesta de spSettlement_Head aún no se ha visto en vivo: se acepta un número, o un campo tipo CodSec_InvoiceDataComexHead. */
  private extractHeadId(data: unknown): number | null {
    const asId = (v: unknown): number | null => {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
    };
    const scan = (obj: unknown): number | null => {
      if (Array.isArray(obj)) return obj.length === 1 ? scan(obj[0]) : null;
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          if (/codsec.*(invoicedatacomexhead|head)/i.test(k.replace(/_/g, ''))) return asId(v);
        }
        return null;
      }
      return asId(obj);
    };
    return scan(data);
  }

  private isAmbiguous(error?: string): boolean {
    return /timeout|timed out|econnreset|econnrefused|socket|network|fetch failed|abort/i.test(error ?? '');
  }

  private isBlank(v: unknown): boolean {
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  }

  private parsePF(raw: string): string {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException('numberPF debe ser un número de Proforma válido');
    }
    return String(n);
  }
}
