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
  /**
   * José (respuesta a la pregunta 9): Dirección, Puerto de arribo y Puerto de
   * embarque vienen POR DEFECTO de este SP y el usuario los puede modificar.
   * En la verificación del 2026-09-23 aún no venían; se leen con tolerancia
   * al nombre exacto del campo (ver LiquidacionService.defaultsDeOben).
   */
  [campo: string]: unknown;
}

/** De dónde salió cada valor del encabezado — se muestra en pantalla, nada queda "de la nada". */
export type OrigenValor = 'oben' | 'maestro' | 'calculado' | 'usuario' | 'provisional';

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

/**
 * Datos del envío que se digitan UNA sola vez (José, llamada del 2026-09-30):
 * no van a Oben tal cual — alimentan la fórmula por Incoterm, que los
 * prorratea por kilos entre las líneas.
 */
export interface LiquidacionTotalesInput {
  /** DAP, DDP, CFR, CPT, FCA o FOB. Lo digita el usuario hasta que la "API Fase 1" de José lo traiga por PF. */
  incoterm?: string | null;
  /** Flete de todo el envío (USD). */
  flete?: number | null;
  /** Otros gastos de todo el envío (USD). */
  otrosGastos?: number | null;
  /** "Valor de la póliza": divisor global del seguro (FOB inicial = Subtotal ÷ Valor de la póliza). Vigente: 1.00053 (José, 2026-09-30); puede variar en el año. */
  valorPoliza?: number | null;
}

export interface LiquidacionInput {
  header?: LiquidacionHeaderValues;
  totales?: LiquidacionTotalesInput;
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
  /** Incoterm normalizado (p. ej. "CFR"), o null si no se indicó. */
  incoterm: string | null;
  /** De dónde salió: del ERP de Oben (reporte de proformas) o lo escogió el usuario. */
  incotermOrigen: 'oben' | 'usuario' | null;
  header: LiquidacionHeaderValues;
  /** Los datos del envío con los que se calculó (en modo simulado, incluye los de ejemplo). */
  totales: LiquidacionTotalesInput;
  lines: LiquidacionDraftLine[];
  /** Origen de cada valor del encabezado (Oben, maestro de tarifas, calculado o digitado). */
  headerOrigen: Partial<Record<keyof LiquidacionHeaderValues, OrigenValor>>;
  /** Origen del flete y los otros gastos del envío (tabla de fletes, calculado, provisional o digitado). */
  totalesOrigen: Partial<Record<'flete' | 'otrosGastos', OrigenValor>>;
  /** Ajustes automáticos que hizo la fórmula (p. ej. otros costos destino reemplazados por Destination Charges). */
  ajustes: string[];
  /** Todo lo que falta para poder enviar — nada se inventa. */
  missing: string[];
  readyToSubmit: boolean;
  /**
   * true = los datos del envío (flete, otros gastos, póliza...) son de
   * EJEMPLO. Un borrador simulado puede simularse (dry-run) pero NUNCA
   * enviarse a Oben con `confirm:true`.
   */
  simulated: boolean;
  /**
   * Partes de la fórmula que son lectura nuestra y José aún no confirmó por
   * escrito (p. ej. a qué campo de Oben va cada valor). Mismo candado que
   * `simulated`: con alguna, el borrador se simula pero no se envía.
   */
  sinConfirmar: string[];
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
  /** Solo cuando la liquidación se completó en esta llamada: resultado del correo de cierre (OBEN MAS §1.2). */
  cierre?: CierreEnvioResult;
  dryRun: boolean;
  /** Solo en dry-run: los payloads se armaron con datos de ejemplo. */
  simulated?: boolean;
  /** Solo en dry-run: lo que falta que José confirme antes de poder enviar de verdad. */
  sinConfirmar?: string[];
  alreadyDone?: boolean;
  numberPF: string;
  headId?: number;
  detailsCreated?: number;
  payloads?: { header: Record<string, unknown>; details: Record<string, unknown>[] };
}

/** Adjunto del correo de cierre de Liquidación (OBEN MAS §1.2). */
export interface CierreAdjunto {
  key: 'empaque_unificada' | 'proforma';
  label: string;
  filename: string;
  /** true = el documento salió de un simulador — el correo lo rotula siempre. */
  simulated: boolean;
}

/** Qué saldría en el correo de cierre y si puede enviarse (sin enviar nada). */
export interface CierrePreview {
  numberPF: string;
  ordenVenta: string | null;
  cliente: string | null;
  /** La liquidación concluyó en Oben (evento `liquidacion_completada`). */
  liquidacionCompletada: boolean;
  headId: number | null;
  detalles: number | null;
  destinatarios: { to: string[]; cc: string[] };
  asunto: string | null;
  adjuntos: CierreAdjunto[];
  /** true si algún adjunto es simulado. */
  simulated: boolean;
  /** Rótulos de lo simulado, tal como aparecen en el correo. */
  simulatedItems: string[];
  missing: string[];
  yaEnviado: boolean;
  puedeEnviar: boolean;
}

export interface CierreEnvioResult {
  sent: boolean;
  numberPF: string;
  to: string[];
  cc: string[];
  adjuntos: CierreAdjunto[];
  simulated: boolean;
  messageId?: string | null;
  /** Por qué no salió (lo que falta / el error) — la liquidación en Oben NO se ve afectada. */
  missing?: string[];
  error?: string;
}
