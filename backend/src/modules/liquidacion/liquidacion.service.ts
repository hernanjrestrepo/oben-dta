import { BadRequestException, ConflictException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { LiquidacionRatesService } from '../freight-rates/liquidacion-rates.service';
import { OBEN_QUERY_OPTIONS } from '../oben-reports/oben-reports.service';
import { LIQUIDACION_VALUE_CALCULATOR, type LiquidacionValueCalculator } from './liquidacion-value-calculator';
import { CONCEPTOS_POR_INCOTERM, conceptosDe, esFactorPoliza, esMonto, normalizarIncoterm } from './incoterm-rules';
import { defaultsDeOben, paisDeDireccion, type DefaultsDeOben } from './check-settlement-defaults';
import { SP_PROFORMAS_COMEX, incotermDeProforma, paisDeProforma } from './incoterm-de-oben';
import { unwrapCheckSettlement } from './check-settlement-respuesta';
import { LiquidacionCierreService } from './liquidacion-cierre.service';
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
  LiquidacionTotalesInput,
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
/**
 * Una liquidación en 'processing' sin ningún avance guardado en este tiempo
 * se considera interrumpida (el proceso murió a mitad — p. ej. un redeploy,
 * que reinicia `dta-backend`). Entre dos guardados de avance solo hay una
 * escritura (≤ WRITE_OPTIONS.timeoutMs), así que 10 minutos no confunde una
 * liquidación viva con una muerta. Nunca se retoma sola: exige resume +
 * acknowledgeAmbiguous (la escritura en curso pudo haber llegado a Oben).
 */
const STALE_PROCESSING_MS = 10 * 60_000;
/**
 * País de ORIGEN de los despachos de Oben Colombia (planta de Galapa). La hoja
 * "Destination Surcharges" del forwarder de USA viene por país de origen de la
 * ruta hacia USA (Brazil, Colombia, El Salvador, Peru) — no hay fila "USA": los
 * cargos de importación de USA (Entry Fee, ISF, HMF) se buscan por el origen.
 */
const PAIS_ORIGEN = 'Colombia';
/** El reporte de proformas trae TODAS (~100, ~55 KB): se cachea por PF para no pedirlo en cada tecla. */
const INCOTERM_CACHE_MS = 10 * 60_000;
const INCOTERM_QUERY_OPTIONS = { maxAttempts: 1, timeoutMs: 8_000 };

/**
 * Valores PROVISIONALES mientras Oben entrega sus tablas (Hernán, 2026-10-01):
 * lo que no tiene fuente no bloquea la liquidación — se llena con esto y se
 * avisa en pantalla. Lo digitado por el usuario siempre manda.
 */
export const LIQUIDACION_OPCIONES = Symbol('LIQUIDACION_OPCIONES');
export interface LiquidacionOpciones {
  valoresProvisionales: boolean;
}
export const VALORES_PROVISIONALES = {
  /** Película PET (OPET) — partida de trabajo hasta que llegue la tabla por producto. */
  partida: '3920.62.00',
  arancelPct: 10,
  /** Harbor Maintenance Fee cuando no se puede calcular el 0.125 % del FOB final. */
  harborMaintenanceFeeUSD: 300,
} as const;

const HEADER_REQUIRED: Array<[keyof LiquidacionHeaderValues, string]> = [
  ['direccion', 'Dirección'],
  ['puertoArribo', 'Puerto de arribo'],
  ['puertoEmbarque', 'Puerto de embarque'],
  ['paNcm', 'Partida arancelaria NCM'],
  ['paNaladi', 'Partida arancelaria NALADI'],
];
/**
 * Solo cuando el destino es USA (José, 2026-09): Inland/Entry/ISF/HMF salen del
 * archivo de tarifas de María (maestro) o los digita el usuario; Destination
 * Charges es su suma (José, 2026-09-30).
 */
const HEADER_REQUIRED_USA: Array<[keyof LiquidacionHeaderValues, string]> = [
  ['inlandFreight', 'Inland Freight'],
  ['entryFee', 'Entry Fee'],
  ['importerSecurityFiling', 'Importer Security Filing'],
  ['harborMaintenanceFee', 'Harbor Maintenance Fee'],
  ['destinationCharges', 'Destination Charges (Inland + Entry + ISF + HMF)'],
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
/** Número desde la respuesta de Oben: `Number(null)`/`Number('')` darían 0 — un precio o kilos ausente NO es 0. */
const toNum = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;

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
  private readonly proformaCache = new Map<string, { valor: { incoterm: string | null; pais: string | null }; hasta: number }>();

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    private readonly idempotency: IdempotencyService,
    private readonly rates: LiquidacionRatesService,
    @Inject(LIQUIDACION_VALUE_CALCULATOR)
    private readonly calculator: LiquidacionValueCalculator,
    private readonly cierre: LiquidacionCierreService,
    @Optional()
    @Inject(LIQUIDACION_OPCIONES)
    private readonly opciones: LiquidacionOpciones = { valoresProvisionales: false },
  ) {}

  async getDraft(numberPF: string, input: LiquidacionInput = {}): Promise<LiquidacionDraft> {
    const pf = this.parsePF(numberPF);
    const check = await this.fetchCheck(pf);
    // País: Lista de Empaque (producción) → reporte de proformas de Oben → dirección de destino.
    const pais =
      (await this.resolvePais(check.OrdenVenta)) ??
      (await this.proformaDeOben(pf)).pais ??
      paisDeDireccion(defaultsDeOben(check).direccion);
    const esUSA = isUSA(pais);

    const baseLines = check.Detalle.map((l) => {
      const kilos = toNum(l.KilosTotales);
      const precio = toNum(l.Precio);
      return {
        codSecLineFilm: toNum(l.CodSed_LineFilm),
        tipoPelicula: l.TipoPelicula,
        precio,
        kilosTotal: kilos,
        valueTotal: round2(precio * kilos),
      };
    });
    const totalValor = round2(baseLines.reduce((a, l) => a + l.valueTotal, 0));
    const totalKilos = round2(baseLines.reduce((a, l) => a + l.kilosTotal, 0));
    const envio = { totalValor, totalKilos, kilosPorLinea: baseLines.map((l) => l.kilosTotal) };

    const digitados: LiquidacionTotalesInput = { ...(input.totales ?? {}) };
    // Incoterm: lo escogido por el usuario manda; si no, el que trae Oben para la proforma.
    let incotermOrigen: LiquidacionDraft['incotermOrigen'] = digitados.incoterm ? 'usuario' : null;
    if (!digitados.incoterm) {
      const deOben = (await this.proformaDeOben(pf)).incoterm;
      if (deOben) {
        digitados.incoterm = deOben;
        incotermOrigen = 'oben';
      }
    }
    let totales = this.calculator.resolverTotales?.(digitados, envio) ?? digitados;
    const incoterm = normalizarIncoterm(totales.incoterm);
    const conceptos = conceptosDe(incoterm);

    // Encabezado: dirección y puertos vienen por defecto de spCheckSettlement
    // (José, pregunta 9); lo que digita/confirma el usuario manda.
    const header: LiquidacionHeaderValues = {};
    const headerOrigen: LiquidacionDraft['headerOrigen'] = {};
    for (const [key, value] of Object.entries(defaultsDeOben(check)) as Array<[keyof DefaultsDeOben, string]>) {
      header[key] = value;
      headerOrigen[key] = 'oben';
    }
    for (const [key, value] of Object.entries(input.header ?? {}) as Array<[keyof LiquidacionHeaderValues, unknown]>) {
      if (this.isBlank(value)) continue;
      (header as Record<string, unknown>)[key] = value;
      headerOrigen[key] = 'usuario';
    }

    const ajustes: string[] = [];
    const prov = this.opciones?.valoresProvisionales === true;
    if (prov && conceptos?.includes('flete') && !esMonto(totales.flete)) {
      totales = { ...totales, flete: 0 };
      ajustes.push('Flete marítimo en 0: no está en la tabla de fletes (solo trae el tramo dentro de USA). Digítalo si lo tienes.');
    }
    if (prov) {
      for (const key of ['paNcm', 'paNaladi'] as const) {
        if (this.isBlank(header[key])) {
          header[key] = VALORES_PROVISIONALES.partida;
          headerOrigen[key] = 'provisional';
        }
      }
      if (headerOrigen.paNcm === 'provisional' || headerOrigen.paNaladi === 'provisional') {
        ajustes.push(
          `Partida arancelaria PROVISIONAL ${VALORES_PROVISIONALES.partida} (arancel ${VALORES_PROVISIONALES.arancelPct} %) mientras Oben envía la tabla por producto.`,
        );
      }
    }

    const calcular = (t: LiquidacionTotalesInput) =>
      this.calcularLineas(baseLines, input.lines, (l, indice) =>
        this.calculator.compute({ ...envio, indice, pais, esUSA, incoterm, totales: t, line: l }),
      );
    // USA con DAP/DDP sin "otros costos destino" digitados: la primera pasada
    // usa 0 para poder calcular el FOB (y con él el HMF); después se toman de
    // Destination Charges. Si no se puede (faltan cargos), se recalcula sin el 0.
    const otrosPendientesUSA = esUSA && !!conceptos?.includes('otrosGastos') && !isNum(totales.otrosGastos);
    let calculo = calcular(otrosPendientesUSA ? { ...totales, otrosGastos: 0 } : totales);
    const sinConfirmar = [...(this.calculator.sinConfirmar ?? [])];

    if (esUSA && pais) {
      // Inland Freight de la tabla de fletes, por el código postal del destino
      // que trae Oben en Direccion/PuertoArribo (lo digitado manda).
      if (headerOrigen.inlandFreight !== 'usuario') {
        const destino = [header.direccion, header.puertoArribo].filter((v): v is string => typeof v === 'string').join(' ');
        const inland = await this.rates.resolveInlandByAddress(this.ctx.tenantId, 'USA', destino);
        if (isNum(inland.inlandFreight)) {
          header.inlandFreight = inland.inlandFreight;
          headerOrigen.inlandFreight = 'maestro';
          ajustes.push(
            `Inland Freight de la tabla de fletes: ${inland.destinationPort} → ${inland.destinationAddress} (contenedor 40'), USD ${inland.inlandFreight.toFixed(2)}.` +
              (inland.vencida ? ` OJO: esa tarifa venció el ${inland.validUntil} — pedir la actualización al forwarder.` : ''),
          );
        }
      }

      // Harbor Maintenance Fee = 0.125% del FOB FINAL (José, 2026-09-30): se
      // resuelve después de calcular las líneas. Los cargos del maestro de
      // tarifas son solo el valor por defecto.
      const s = await this.rates.resolveSurcharges(this.ctx.tenantId, PAIS_ORIGEN, this.sumaFOB(calculo.lines));
      const delMaestro: Array<[keyof LiquidacionHeaderValues, number | null]> = [
        ['entryFee', s.entryFee],
        ['importerSecurityFiling', s.importerSecurityFiling],
        ['harborMaintenanceFee', s.harborMaintenanceFee],
      ];
      for (const [key, value] of delMaestro) {
        if (headerOrigen[key] === 'usuario') continue;
        (header as Record<string, unknown>)[key] = value;
        if (isNum(value)) headerOrigen[key] = 'maestro';
      }
      if (prov && !isNum(header.harborMaintenanceFee) && headerOrigen.harborMaintenanceFee !== 'usuario') {
        header.harborMaintenanceFee = VALORES_PROVISIONALES.harborMaintenanceFeeUSD;
        headerOrigen.harborMaintenanceFee = 'provisional';
        ajustes.push(
          `Harbor Maintenance Fee PROVISIONAL USD ${VALORES_PROVISIONALES.harborMaintenanceFeeUSD}: no se pudo calcular el 0.125 % del FOB final.`,
        );
      }

      // DestinationCharges = Inland Freight + Entry Fee + ISF + Harbor
      // Maintenance Fee (José, 2026-09-30) — siempre calculado.
      const cargos = [header.inlandFreight, header.entryFee, header.importerSecurityFiling, header.harborMaintenanceFee];
      const dc = cargos.every(isNum) ? round2(cargos.reduce((a, b) => a + b, 0)) : null;
      header.destinationCharges = dc;
      headerOrigen.destinationCharges = 'calculado';

      // Esa suma tiene que ser igual a los OTROS COSTOS DESTINO; si no, se
      // reemplazan por Destination Charges y se recalculan otros gastos por
      // unidad, precio final y FOB final (una sola pasada, como el sistema de Oben).
      if (isNum(dc) && conceptos?.includes('otrosGastos') && totales.otrosGastos !== dc) {
        ajustes.push(
          isNum(totales.otrosGastos)
            ? `Otros costos destino digitados (USD ${totales.otrosGastos.toFixed(2)}) ≠ Destination Charges (USD ${dc.toFixed(2)} = Inland + Entry + ISF + HMF): se reemplazaron y se recalcularon otros gastos por unidad, precio final y FOB final.`
            : `Otros costos destino = Destination Charges (USD ${dc.toFixed(2)} = Inland + Entry + ISF + HMF).`,
        );
        totales = { ...totales, otrosGastos: dc };
        calculo = calcular(totales);
      } else if (otrosPendientesUSA) {
        calculo = calcular(totales);
      } else if (isNum(dc) && conceptos && !conceptos.includes('otrosGastos')) {
        sinConfirmar.push(
          `Destino USA con ${incoterm} (no lleva otros gastos): Destination Charges (USD ${dc.toFixed(2)}) va en el encabezado pero no se descuenta de la mercancía — confirmar con José.`,
        );
      }
    }

    const headerMissing: string[] = [];
    for (const [key, label] of HEADER_REQUIRED) {
      if (this.isBlank(header[key])) headerMissing.push(`Encabezado — ${label}`);
    }
    if (esUSA) {
      for (const [key, label] of HEADER_REQUIRED_USA) {
        // Son montos: un texto ("110", "") tampoco sirve para enviarlo a Oben.
        if (!isNum(header[key])) {
          headerMissing.push(`Encabezado (destino USA) — ${label}`);
        }
      }
    }

    const missing = [
      ...(pais ? [] : ['País de destino: no se pudo resolver desde la orden de venta.']),
      ...headerMissing,
      ...this.faltantesDelEnvio(incoterm, totales),
      ...calculo.missing,
    ];

    return {
      numberPF: pf,
      ordenVenta: check.OrdenVenta,
      ordenCompra: check.OrdenCompra,
      cliente: check.Cliente,
      pais,
      esUSA,
      incoterm,
      incotermOrigen: incoterm ? incotermOrigen : null,
      header,
      headerOrigen,
      totales,
      lines: calculo.lines,
      ajustes,
      missing,
      readyToSubmit: missing.length === 0,
      simulated: this.calculator.simulated,
      sinConfirmar,
    };
  }

  /**
   * Incoterm y país de la proforma según Oben (spCheckSalesOrderComex_Paradixe,
   * servidor de liquidación). Nunca bloquea el borrador: si Oben no responde o
   * no trae el campo, null. Cacheado por PF.
   */
  private async proformaDeOben(pf: string): Promise<{ incoterm: string | null; pais: string | null }> {
    const key = `${this.ctx.tenantId}:${pf}`;
    const cached = this.proformaCache.get(key);
    if (cached && cached.hasta > Date.now()) return cached.valor;
    let valor: { incoterm: string | null; pais: string | null } = { incoterm: null, pais: null };
    try {
      const res = await this.hub.call<unknown>(
        'obenCostOrder',
        'query.run',
        { procedure: SP_PROFORMAS_COMEX, numberOrderSales: pf, target: 'liquidacion' },
        INCOTERM_QUERY_OPTIONS,
      );
      if (res.ok) valor = { incoterm: incotermDeProforma(res.data, pf), pais: paisDeProforma(res.data, pf) };
    } catch {
      /* sin datos de Oben: se sigue sin ellos */
    }
    this.proformaCache.set(key, { valor, hasta: Date.now() + INCOTERM_CACHE_MS });
    return valor;
  }

  /** Aplica la fórmula a cada línea (con las sobrescrituras del usuario) y lista lo que falta por línea. */
  private calcularLineas(
    baseLines: Array<{ codSecLineFilm: number; tipoPelicula: string; precio: number; kilosTotal: number; valueTotal: number }>,
    overrides: LiquidacionInput['lines'],
    compute: (l: (typeof baseLines)[number], indice: number) => LiquidacionLineValues,
  ): { lines: LiquidacionDraftLine[]; missing: string[] } {
    const missing: string[] = [];
    const lines = baseLines.map((l, indice) => {
      const values: LiquidacionLineValues = {
        kilosTotal: l.kilosTotal,
        valueTotal: l.valueTotal,
        ...compute(l, indice),
        ...(overrides?.[String(l.codSecLineFilm)] ?? {}),
      };
      const etiqueta = `Línea ${l.codSecLineFilm} (${l.tipoPelicula})`;
      for (const [key, label] of LINE_REQUIRED) {
        if (!isNum(values[key])) missing.push(`${etiqueta} — ${label}`);
      }
      if (isNum(values.valueFOB) && values.valueFOB < 0) {
        missing.push(`${etiqueta} — FOB final negativo (${values.valueFOB}): revisa el flete/otros gastos digitados.`);
      }
      return { codSecLineFilm: l.codSecLineFilm, tipoPelicula: l.tipoPelicula, precio: l.precio, ...values };
    });
    return { lines, missing };
  }

  /** Suma del FOB final de la PF, o undefined si alguna línea aún no lo tiene (nunca un FOB inventado). */
  private sumaFOB(lines: LiquidacionDraftLine[]): number | undefined {
    const fobs = lines.map((l) => l.valueFOB);
    return fobs.every(isNum) ? round2(fobs.reduce((a, b) => a + b, 0)) : undefined;
  }

  /** Datos del envío que el Incoterm exige (ver incoterm-rules.ts) y no se digitaron. */
  private faltantesDelEnvio(incoterm: string | null, t: LiquidacionTotalesInput): string[] {
    if (!incoterm) return [`Incoterm de la PF (${Object.keys(CONCEPTOS_POR_INCOTERM).join(', ')})`];
    const conceptos = conceptosDe(incoterm);
    if (!conceptos) {
      return [`Incoterm ${incoterm}: no es un Incoterm 2020 (${Object.keys(CONCEPTOS_POR_INCOTERM).join(', ')})`];
    }
    const out: string[] = [];
    if (conceptos.includes('flete') && !esMonto(t.flete)) out.push(`Envío (${incoterm}) — Flete total`);
    if (conceptos.includes('otrosGastos') && !esMonto(t.otrosGastos)) out.push(`Envío (${incoterm}) — Otros gastos totales`);
    if (conceptos.includes('seguro') && !esFactorPoliza(t.valorPoliza)) {
      out.push(`Envío (${incoterm}) — Valor de la póliza (divisor del seguro, mayor a 1)`);
    }
    return out;
  }

  async submit(
    numberPF: string,
    input: LiquidacionInput,
    options: LiquidacionSubmitOptions = {},
  ): Promise<LiquidacionSubmitResult> {
    const draft = await this.getDraft(numberPF, input);
    // Candados: un borrador con datos SIMULADOS, o calculado con partes de la
    // fórmula que José aún no confirma, nunca escribe en el ERP real de Oben
    // — ni primer envío ni reanudación. Se revisan antes de tocar la
    // idempotencia y antes de cualquier llamada.
    if (options.confirm === true && draft.simulated) {
      throw new BadRequestException({
        message:
          'Esta liquidación está SIMULADA (LIQUIDACION_SIMULATION_MODE: datos del envío de ejemplo): se puede simular sin confirm, pero nunca enviarse a Oben.',
        simulated: true,
      });
    }
    if (options.confirm === true && draft.sinConfirmar.length > 0) {
      throw new BadRequestException({
        message:
          'La fórmula de liquidación tiene puntos que José aún no confirma por escrito: se puede simular sin confirm, pero todavía no enviarse a Oben.',
        sinConfirmar: draft.sinConfirmar,
      });
    }
    if (!draft.readyToSubmit) {
      throw new BadRequestException({
        message: 'La liquidación no se puede enviar todavía: faltan datos (no se inventan).',
        missing: draft.missing,
      });
    }
    const payloads = this.buildPayloads(draft);

    if (options.confirm !== true) {
      return { dryRun: true, simulated: draft.simulated, sinConfirmar: draft.sinConfirmar, numberPF: draft.numberPF, payloads };
    }

    // headId/detailsDone declaran que algo YA existe en Oben: solo tienen
    // sentido al reanudar una liquidación a medias, nunca en un primer envío.
    if (!options.resume && (options.headId !== undefined || options.detailsDone !== undefined)) {
      throw new BadRequestException('headId y detailsDone solo se aceptan al reanudar (resume:true) una liquidación a medias.');
    }
    const lineIds = draft.lines.map((l) => l.codSecLineFilm);
    const foreign = (options.detailsDone ?? []).filter((id) => !lineIds.includes(id));
    if (foreign.length > 0) {
      throw new BadRequestException(
        `detailsDone trae líneas que no son de la PF ${draft.numberPF}: ${foreign.join(', ')} (líneas válidas: ${lineIds.join(', ')}).`,
      );
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
      const prev = claim.existingResult ?? { headId: null, detailsDone: [] };
      if (claim.existingStatus === 'processing') {
        // O está corriendo ahora mismo, o el proceso murió a mitad (reinicio)
        // y quedaría bloqueada para siempre. Solo se retoma si el usuario lo
        // pide explícitamente Y no hubo avance en STALE_PROCESSING_MS.
        if (!options.resume || !options.acknowledgeAmbiguous) {
          throw new ConflictException({
            message: `La PF ${draft.numberPF} ya se está liquidando en este momento. Si el proceso se interrumpió (p. ej. un reinicio del servicio), espera ${STALE_PROCESSING_MS / 60_000} minutos, verifica en Oben qué quedó creado y reintenta con resume:true y acknowledgeAmbiguous:true.`,
            progress: prev,
          });
        }
        const reclaimed = await this.idempotency.reclaimStale(tenantId, key, new Date(Date.now() - STALE_PROCESSING_MS));
        if (!reclaimed) {
          throw new ConflictException({
            message: `La PF ${draft.numberPF} ya se está liquidando en este momento (hubo avance hace menos de ${STALE_PROCESSING_MS / 60_000} minutos).`,
            progress: prev,
          });
        }
      } else {
        // failed → solo se continúa con resume explícito
        if (!options.resume) {
          throw new ConflictException({
            message: `La PF ${draft.numberPF} tiene una liquidación a medias. Verifica en Oben y reintenta con resume:true.`,
            progress: prev,
          });
        }
        if (prev.ambiguous && !options.acknowledgeAmbiguous) {
          throw new ConflictException({
            message:
              'El último fallo fue ambiguo (timeout/red): el registro pudo haberse creado en Oben. Verifica allí y reintenta con acknowledgeAmbiguous:true (y headId si el encabezado ya existe, o detailsDone con las líneas cuyo detalle ya existe).',
            progress: prev,
          });
        }
        // Atómico: dos reanudaciones simultáneas no pueden correr ambas (cada
        // una crearía el encabezado/detalles pendientes → duplicados en Oben).
        if (!(await this.idempotency.reclaimFailed(tenantId, key))) {
          throw new ConflictException(`Otra solicitud ya está reanudando la PF ${draft.numberPF} en este momento.`);
        }
      }
      progress = { ...prev, detailsDone: [...(prev.detailsDone ?? [])], ambiguous: false };
    }
    if (options.headId !== undefined) progress.headId = options.headId;
    for (const id of options.detailsDone ?? []) {
      if (!progress.detailsDone.includes(id)) progress.detailsDone.push(id);
    }

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
      outputData: {
        headId: progress.headId,
        details: progress.detailsDone.length,
        ordenVenta: draft.ordenVenta,
        cliente: draft.cliente,
        // Siempre false (el candado de arriba impide completar una simulada);
        // queda explícito para el correo de cierre.
        simulated: draft.simulated,
      },
    });
    // OBEN MAS §1.2: al concluir, correo automático a COMEX y Facturación. Un
    // fallo del correo nunca deshace ni hace fallar la liquidación ya creada.
    const cierre = await this.cierre.enviarTrasCompletar(draft.numberPF);
    return {
      dryRun: false,
      numberPF: draft.numberPF,
      headId: progress.headId ?? undefined,
      detailsCreated: progress.detailsDone.length,
      cierre,
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
    const d = unwrapCheckSettlement(res.data, pf) as Partial<CheckSettlementResponse> | null | undefined;
    if (!d || typeof d !== 'object' || !Array.isArray(d.Detalle) || d.Detalle.length === 0 || !d.Proforma) {
      throw new BadRequestException(
        `Oben no devolvió datos de liquidación para la PF ${pf} (respuesta sin Proforma/Detalle).`,
      );
    }
    for (const l of d.Detalle) {
      if (!isNum(toNum(l.CodSed_LineFilm)) || !isNum(toNum(l.KilosTotales)) || !isNum(toNum(l.Precio))) {
        throw new BadRequestException(`Línea de liquidación inválida para la PF ${pf}: ${JSON.stringify(l).slice(0, 200)}`);
      }
    }
    return d as CheckSettlementResponse;
  }

  private async resolvePais(ordenVenta: string): Promise<string | null> {
    const n = Number(ordenVenta);
    if (!Number.isFinite(n) || n <= 0) return null;
    // La Lista de Empaque es un reporte de PRODUCCIÓN (no del servidor de liquidación).
    try {
      const res = await this.hub.call<Record<string, unknown>>(
        'obenCostOrder',
        'query.run',
        { procedure: 'spEmpaqueUnificada_Paradixe', numberOrderSales: n },
        OBEN_QUERY_OPTIONS,
      );
      const pais = String((res.ok ? res.data : null)?.Pais ?? '').trim();
      return pais || null;
    } catch {
      return null;
    }
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

  /**
   * ¿Pudo la escritura haber llegado a Oben pese al error? Timeouts/cortes de
   * red, y también 502/504 de un proxy intermedio (el backend de Oben pudo
   * haber terminado de procesar aunque el proxy se rindiera).
   */
  private isAmbiguous(error?: string): boolean {
    return /timeout|time-out|timed out|econnreset|econnrefused|socket|network|fetch failed|abort|\bHTTP 50[24]\b/i.test(error ?? '');
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
