/**
 * Respuesta REAL de APILiquidacionParadixe (spCheckSettlement_Paradixe),
 * verificada en vivo el 2026-09-23 contra las PF 10867, 11357 y 11271: misma
 * estructura sin importar país ni si la PF ya está liquidada. OJO: el campo
 * llega como `CodSed_LineFilm` (con "d", typo del origen), no `CodSec_`.
 * No trae Direccion / PuertoArribo / PuertoEmbarque ni cargos de USA.
 */
export interface CheckSettlementLine {
  CodSed_LineFilm: number;
  TipoPelicula: string;
  Precio: number;
  KilosTotales: number;
}

export interface CheckSettlementResponse {
  Proforma: string;
  OrdenVenta: string;
  OrdenCompra: string;
  Cliente: string;
  Detalle: CheckSettlementLine[];
}

/** Valores del encabezado (spSettlement_Head). Todo opcional en la entrada — lo que falte bloquea el envío. */
export interface LiquidacionHeaderValues {
  direccion?: string | null;
  notes?: string | null;
  paNcm?: string | null;
  paNaladi?: string | null;
  description?: string | null;
  puertoArribo?: string | null;
  puertoEmbarque?: string | null;
  inlandFreight?: number | null;
  entryFee?: number | null;
  importerSecurityFiling?: number | null;
  harborMaintenanceFee?: number | null;
  destinationCharges?: number | null;
}

/** Valores de una línea de detalle (spSettlement_Detail). `codSecPoliza` se omite a propósito (José, 2026-09). */
export interface LiquidacionLineValues {
  kilosTotal?: number | null;
  kilosTotalUnit?: number | null;
  valueFOB?: number | null;
  valueTotal?: number | null;
  valueFreight?: number | null;
  valueFreightUnit?: number | null;
  valueSure?: number | null;
  valueSureUnit?: number | null;
  expensesOther?: number | null;
  expensesOtherUnit?: number | null;
  subTotal?: number | null;
  total?: number | null;
  totalUnidad?: number | null;
}

export interface LiquidacionInput {
  header?: LiquidacionHeaderValues;
  /** Sobrescrituras por línea, indexadas por `codSecLineFilm`. */
  lines?: Record<string, LiquidacionLineValues>;
}

export interface LiquidacionDraftLine extends LiquidacionLineValues {
  codSecLineFilm: number;
  tipoPelicula: string;
  precio: number;
}

export interface LiquidacionDraft {
  numberPF: string;
  ordenVenta: string;
  ordenCompra: string;
  cliente: string;
  pais: string | null;
  esUSA: boolean;
  header: LiquidacionHeaderValues;
  lines: LiquidacionDraftLine[];
  /** Todo lo que falta para poder enviar — nada se inventa. */
  missing: string[];
  readyToSubmit: boolean;
  /**
   * true = flete/seguro/otros gastos salieron de la fórmula de Incoterm
   * SIMULADA. Un borrador simulado puede simularse (dry-run) pero NUNCA
   * enviarse a Oben con `confirm:true`.
   */
  simulated: boolean;
}

export interface LiquidacionSubmitOptions {
  /** Sin `confirm: true` solo se simula (no se llama a ninguna API de escritura de Oben). */
  confirm?: boolean;
  /** Continuar una liquidación que quedó a medias (ver LiquidacionProgress). */
  resume?: boolean;
  /** El usuario verificó en Oben el estado de una llamada ambigua (timeout) y asume el riesgo de reintentar. */
  acknowledgeAmbiguous?: boolean;
  /** Si el encabezado ya existe en Oben pero no pudimos leer su id, se indica a mano. Solo con `resume`. */
  headId?: number;
  /**
   * Líneas (`codSecLineFilm`) cuyo detalle el usuario verificó que YA existe
   * en Oben tras un fallo ambiguo — no se vuelven a crear (Oben no permite
   * borrar un duplicado). Solo con `resume`.
   */
  detailsDone?: number[];
}

/** Avance persistido por PF (en idempotency_records.result) — permite no duplicar el encabezado ni los detalles. */
export interface LiquidacionProgress {
  headId: number | null;
  headResponse?: unknown;
  detailsDone: number[];
  lastError?: string;
  /** true si el último fallo pudo haber dejado el registro creado en Oben (timeout/red). */
  ambiguous?: boolean;
}

export interface LiquidacionSubmitResult {
  dryRun: boolean;
  /** Solo en dry-run: los payloads se armaron con la fórmula simulada. */
  simulated?: boolean;
  alreadyDone?: boolean;
  numberPF: string;
  headId?: number;
  detailsCreated?: number;
  payloads?: { header: Record<string, unknown>; details: Record<string, unknown>[] };
}
