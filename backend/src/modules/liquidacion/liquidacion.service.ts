import { createHash } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LiquidacionAprobacion } from '../../entities/liquidacion-aprobacion.entity';
import { LiquidacionRuta } from '../../entities/liquidacion-ruta.entity';
import { LiquidacionRutaAdjunto } from '../../entities/liquidacion-ruta-adjunto.entity';
import { LiquidacionPreferenciaCliente } from '../../entities/liquidacion-preferencia-cliente.entity';
import { LiquidacionDescarte } from '../../entities/liquidacion-descarte.entity';
import { descripcionNcm, descripcionPartida } from '../facturacion/factura-dian/representacion';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { LiquidacionRatesService, ciudadDe, type OpcionInland } from '../freight-rates/liquidacion-rates.service';
import { OBEN_QUERY_OPTIONS } from '../oben-reports/oben-reports.service';
import { LIQUIDACION_VALUE_CALCULATOR, noQuedarPorDebajo, type LiquidacionValueCalculator } from './liquidacion-value-calculator';
import { CONCEPTOS_POR_INCOTERM, conceptosDe, esFactorPoliza, esMonto, normalizarIncoterm } from './incoterm-rules';
import { defaultsDeOben, paisDeDireccion, type DefaultsDeOben } from './check-settlement-defaults';
import { SP_PROFORMAS_COMEX, incotermDeCheck, incotermDeProforma, paisDeProforma, parsearProformasComex } from './incoterm-de-oben';
import { unwrapCheckSettlement } from './check-settlement-respuesta';
import { ARANCEL_USA_PCT, partidaComun } from './partidas-arancelarias';
import { LiquidacionCierreService } from './liquidacion-cierre.service';
import type {
  CambioRuta,
  CheckSettlementResponse,
  LiquidacionDraft,
  RutaLiquidacion,
  LiquidacionDraftLine,
  LiquidacionHeaderValues,
  LiquidacionInput,
  LiquidacionLineValues,
  LiquidacionProgress,
  LiquidacionSubmitOptions,
  LiquidacionSubmitResult,
  LiquidacionTotalesInput,
  OrigenValor,
  ProformaPendienteComex,
} from './liquidacion.types';

/** "Videplast Indústria de Embalagens Ltda." → "VIDEPLAST INDUSTRIA DE EMBALAGENS LTDA" (para las preferencias por cliente). */
export function claveCliente(nombre: string | null | undefined): string {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Sin nulos ni textos vacíos: lo que de verdad se digitó. */
function soloDigitado<T extends object>(o: T | null | undefined): Partial<T> {
  return Object.fromEntries(
    Object.entries(o ?? {}).filter(([, v]) => v !== null && v !== undefined && !(typeof v === 'string' && !v.trim())),
  ) as Partial<T>;
}

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
/** Carga neta de un contenedor de 40' según el archivo de fletes de Oben (26.000 kg): define cuántos contenedores paga la PF. */
const NET_PAYLOAD_40_KG = 26_000;
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
  /** COMEX debe aprobar la liquidación antes de enviarla a Oben (decisión de Hernán, 6-oct). El módulo lo deja siempre en true. */
  requiereAprobacion?: boolean;
}
export const VALORES_PROVISIONALES = {
  /** Película PET (OPET) — partida de trabajo hasta que llegue la tabla por producto. */
  partida: '3920.62.00',
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

/** Marítimo + Inland de una ruta, por todos los contenedores; null si no hay ninguno. */
function costoRuta(r: { maritima: number | null; inland: number | null }, contenedores: number): number | null {
  if (r.maritima === null && r.inland === null) return null;
  return round2(((r.maritima ?? 0) + (r.inland ?? 0)) * contenedores);
}

/** El Inland más barato (vigente primero) que sale del puerto/rampa donde llega el marítimo. */
function mejorInlandDesde(opciones: OpcionInland[], puerto: string): OpcionInland | null {
  const ciudad = ciudadDe(puerto)?.toLowerCase();
  const delPuerto = opciones.filter((o) => o.puerto === puerto || (!!ciudad && ciudadDe(o.puerto)?.toLowerCase() === ciudad));
  return [...delPuerto].sort((a, b) => Number(a.vencida) - Number(b.vencida) || a.valor - b.valor)[0] ?? null;
}

/** "Cartagena → Cincinnati, OH (Ramp) · Trading / HAPAG LLOYD USD 3150.00 + Inland Trading USD 860.00". */
function describirRuta(ruta: RutaLiquidacion, ids: { maritimaId: string | null; inlandId: string | null; aduanaId?: string | null }): string {
  const m = ruta.opciones.maritimas.find((o) => o.id === ids.maritimaId);
  const i = ruta.opciones.inland.find((o) => o.id === ids.inlandId);
  const a = ruta.opciones.inland.find((o) => o.id === (ids.aduanaId ?? ids.inlandId));
  const partes = [
    m ? `${ciudadDe(m.origen) ?? m.origen} → ${m.destino} · ${[m.forwarder, m.naviera].filter(Boolean).join(' / ')} USD ${m.flete.toFixed(2)}` : null,
    i ? `Inland ${i.forwarder ?? ''} desde ${i.puerto} USD ${i.valor.toFixed(2)}` : null,
    a && isNum(a.comisionAduanera) ? `Aduana ${a.forwarder ?? ''} USD ${a.comisionAduanera.toFixed(2)}` : null,
  ].filter(Boolean);
  return partes.join(' + ') || 'Sin tarifa del tarifario';
}
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
  /** País por OV (no cambia): cada recálculo de la pantalla volvía a pedir el reporte de empaque a Oben. */
  private readonly paisCache = new Map<string, { pais: string; hasta: number }>();
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
    @Optional()
    @InjectRepository(LiquidacionAprobacion)
    private readonly aprobaciones?: Repository<LiquidacionAprobacion>,
    @Optional()
    @InjectRepository(LiquidacionRuta)
    private readonly rutas?: Repository<LiquidacionRuta>,
    @Optional()
    @InjectRepository(LiquidacionRutaAdjunto)
    private readonly adjuntos?: Repository<LiquidacionRutaAdjunto>,
    @Optional()
    @InjectRepository(LiquidacionPreferenciaCliente)
    private readonly preferencias?: Repository<LiquidacionPreferenciaCliente>,
    @Optional()
    @InjectRepository(LiquidacionDescarte)
    private readonly descartes?: Repository<LiquidacionDescarte>,
  ) {}

  /** Borrador + estado de la aprobación de COMEX (si la PF ya está lista para aprobarse). */
  async getDraft(numberPF: string, input: LiquidacionInput = {}): Promise<LiquidacionDraft> {
    const draft = await this.armarDraft(numberPF, input);
    if (draft.readyToSubmit && !draft.simulated) {
      draft.aprobacion = await this.estadoAprobacion(draft);
    }
    return draft;
  }

  private async armarDraft(numberPF: string, input: LiquidacionInput = {}): Promise<LiquidacionDraft> {
    const pf = this.parsePF(numberPF);
    const check = await this.fetchCheck(pf);
    // Lo que COMEX dejó al aprobar se vuelve a aplicar (20-oct: se perdía al recargar y en la factura); lo
    // que se digita ahora manda sobre eso.
    const aprobada = await this.entradaAprobada(pf);
    const lineasDigitadas = input.lines ?? aprobada?.lines;
    // País: Lista de Empaque (producción) → reporte de proformas de Oben → dirección de destino.
    const pais =
      (await this.resolvePais(check.OrdenVenta)) ??
      (await this.proformaDeOben(pf)).pais ??
      paisDeDireccion(defaultsDeOben(check).direccion);
    const esUSA = isUSA(pais);

    // Partida arancelaria de Colombia por SKU (spCheckSettlement: 'Parida' el 6-oct, 'Partida' desde el 16-oct).
    const paridas = check.Detalle.map((l) => String(l.Partida ?? l.Parida ?? '').trim());
    const descripciones = check.Detalle.map((l) => String(l.DescripcionSKU ?? '').trim());
    const descripcionSku = descripciones.every((d) => d && d === descripciones[0]) ? descripciones[0] : null;
    const paridasDistintas = [...new Set(paridas.filter(Boolean))];
    const paridaComun = paridasDistintas.length === 1 && paridas.every(Boolean) ? paridasDistintas[0] : null;
    const paridaMezcla = paridasDistintas.length > 1;

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

    const digitados: LiquidacionTotalesInput = { ...soloDigitado(aprobada?.totales), ...soloDigitado(input.totales) };
    // Incoterm: lo escogido por el usuario manda; si no, el que trae Oben para la proforma.
    let incotermOrigen: LiquidacionDraft['incotermOrigen'] = digitados.incoterm ? 'usuario' : null;
    if (!digitados.incoterm) {
      // Primero el campo Incoterms de spCheckSettlement (Oben lo agregó el 16-oct; trae también las PF
      // cerradas, como la 11237); si no viene, el reporte de proformas (solo las abiertas).
      const deOben = incotermDeCheck(check) ?? (await this.proformaDeOben(pf)).incoterm;
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
    for (const [key, value] of Object.entries(aprobada?.header ?? {}) as Array<[keyof LiquidacionHeaderValues, unknown]>) {
      if (this.isBlank(value) || headerOrigen[key] === 'usuario') continue;
      (header as Record<string, unknown>)[key] = value;
      headerOrigen[key] = 'comex';
    }
    // Preferencias del cliente (lo que COMEX dejó para este cliente y esta partida en otra proforma).
    const partidaOben = paridaComun ?? [...new Set(check.Detalle.map((l) => String(l.TipoPelicula ?? '').trim()).filter(Boolean))].sort().join('+');
    const preferencia = await this.preferenciaDe(check.Cliente, partidaOben);
    const ajustesCliente: string[] = [];
    for (const key of ['paNcm', 'paNaladi'] as const) {
      const v = preferencia?.[key];
      if (!v || headerOrigen[key] === 'usuario' || headerOrigen[key] === 'comex') continue;
      header[key] = v;
      headerOrigen[key] = 'cliente';
      ajustesCliente.push(`${key === 'paNcm' ? 'Partida NCM' : 'Partida NALADI'} ${v}: la que COMEX dejó para este cliente${preferencia?.numberPF ? ` (PF ${preferencia.numberPF})` : ''}.`);
    }

    const ajustes: string[] = [...ajustesCliente];
    const prov = this.opciones?.valoresProvisionales === true;
    const totalesOrigen: LiquidacionDraft['totalesOrigen'] = {};
    if (esMonto(digitados.flete)) totalesOrigen.flete = 'usuario';
    if (isNum(digitados.otrosGastos)) totalesOrigen.otrosGastos = 'usuario';
    // Las tarifas de la tabla de fletes son por contenedor de 40'.
    const contenedores = Math.max(1, Math.ceil(totalKilos / NET_PAYLOAD_40_KG));
    const porContenedores = contenedores > 1 ? ` × ${contenedores} contenedores` : '';

    // Inland Freight (pata 3) de la tabla de fletes, por el código postal del
    // destino que trae Oben en Direccion/PuertoArribo (lo digitado manda). Va
    // antes del flete marítimo: la pata 2 tiene que llegar al puerto del que
    // sale el Inland.
    // Ruta (patas 2 y 3). Sugerida: la más barata vigente al puerto de la PF. COMEX puede escoger otra
    // DEL TARIFARIO (reunión del 15-oct: puerto de origen/destino, agente, naviera, transportador
    // terrestre); nada se digita. Lo escogido se guarda en liquidacion_rutas (POST /liquidacion/:pf/ruta).
    const guardada = await this.rutaGuardada(pf);
    const opcionesRuta =
      (esUSA || conceptos?.includes('flete')) && this.rates.opcionesDeRuta
        ? await this.rates.opcionesDeRuta(this.ctx.tenantId, { direccion: header.direccion, puertoArribo: header.puertoArribo })
        : null;
    const maritimaComex = guardada?.maritimaId ? (opcionesRuta?.maritimas.find((o) => o.id === guardada.maritimaId) ?? null) : null;
    const inlandComex = guardada?.inlandId ? (opcionesRuta?.inland.find((o) => o.id === guardada.inlandId) ?? null) : null;
    if ((guardada?.maritimaId && !maritimaComex) || (guardada?.inlandId && !inlandComex) || (guardada?.aduanaId && !opcionesRuta?.inland.some((o) => o.id === guardada.aduanaId))) {
      ajustes.push('La ruta que había escogido COMEX ya no está en el tarifario (se cargó uno nuevo): se usó la sugerida. Escógela de nuevo.');
    }
    const sug = { maritimaId: null as string | null, inlandId: null as string | null, maritima: null as number | null, inland: null as number | null };
    const act = { maritimaId: null as string | null, inlandId: null as string | null, maritima: null as number | null, inland: null as number | null };

    let puertoInland: string | null = null;
    let puertoInlandSugerido: string | null = null;
    if (esUSA && pais && headerOrigen.inlandFreight !== 'usuario') {
      const destino = [header.direccion, header.puertoArribo].filter((v): v is string => typeof v === 'string').join(' ');
      // El puerto de arribo de la PF manda (15-oct: la PF 11237 dice Cincinnati y se había ido por Columbus).
      const inland = await this.rates.resolveInlandByAddress(this.ctx.tenantId, 'USA', destino, undefined, header.puertoArribo);
      if (isNum(inland.inlandFreight)) {
        Object.assign(sug, { inlandId: inland.id ?? null, inland: inland.inlandFreight });
        puertoInlandSugerido = inland.destinationPort;
      }
      // Si COMEX escogió solo el marítimo, el Inland más barato vigente que sale de su puerto de destino.
      const conectado = !inlandComex && maritimaComex && opcionesRuta ? mejorInlandDesde(opcionesRuta.inland, maritimaComex.destino) : null;
      const elegido = inlandComex ?? conectado;
      if (elegido) {
        header.inlandFreight = round2(elegido.valor * contenedores);
        headerOrigen.inlandFreight = inlandComex ? 'comex' : 'maestro';
        puertoInland = elegido.puerto;
        Object.assign(act, { inlandId: elegido.id, inland: elegido.valor });
        ajustes.push(
          `Inland Freight ${inlandComex ? 'escogido por COMEX' : 'que sale del puerto del marítimo escogido por COMEX'}: ${elegido.puerto} → ${elegido.direccion} (${[elegido.forwarder, "contenedor 40'"].filter(Boolean).join(', ')}), USD ${elegido.valor.toFixed(2)}${porContenedores}.` +
            (elegido.vencida ? ` OJO: esa tarifa venció el ${elegido.validUntil}.` : ''),
        );
      } else if (isNum(inland.inlandFreight)) {
        header.inlandFreight = round2(inland.inlandFreight * contenedores);
        headerOrigen.inlandFreight = 'maestro';
        puertoInland = inland.destinationPort;
        Object.assign(act, { inlandId: inland.id ?? null, inland: inland.inlandFreight });
        ajustes.push(
          `Inland Freight de la tabla de fletes: ${inland.destinationPort} → ${inland.destinationAddress} (${[inland.forwarder, "contenedor 40'"].filter(Boolean).join(', ')}), USD ${inland.inlandFreight.toFixed(2)}${porContenedores}.` +
            (inland.vencida ? ` OJO: esa tarifa venció el ${inland.validUntil} — pedir la actualización al forwarder.` : ''),
        );
      }
    }

    // Flete (pata 2, marítimo) de la tabla de fletes; lo digitado manda.
    if (conceptos?.includes('flete') && !esMonto(totales.flete)) {
      const marSugerido = await this.rates.resolveOceanFreight?.(this.ctx.tenantId, header.puertoEmbarque, puertoInlandSugerido, header.puertoArribo);
      if (marSugerido && isNum(marSugerido.flete)) Object.assign(sug, { maritimaId: marSugerido.id ?? null, maritima: marSugerido.flete });
      const mar = maritimaComex
        ? null
        : puertoInland === puertoInlandSugerido
          ? marSugerido
          : await this.rates.resolveOceanFreight?.(this.ctx.tenantId, header.puertoEmbarque, puertoInland, header.puertoArribo);
      if (maritimaComex) {
        totales = { ...totales, flete: round2(maritimaComex.flete * contenedores) };
        totalesOrigen.flete = 'comex';
        Object.assign(act, { maritimaId: maritimaComex.id, maritima: maritimaComex.flete });
        ajustes.push(
          `Flete marítimo escogido por COMEX: ${maritimaComex.origen} → ${maritimaComex.destino} (${[maritimaComex.forwarder, maritimaComex.naviera].filter(Boolean).join(' / ')}, contenedor 40'), USD ${maritimaComex.flete.toFixed(2)}${porContenedores}.` +
            (maritimaComex.vencida ? ` OJO: esa tarifa venció el ${maritimaComex.validUntil}.` : ''),
        );
      } else if (mar && isNum(mar.flete)) {
        Object.assign(act, { maritimaId: mar.id ?? null, maritima: mar.flete });
        totales = { ...totales, flete: round2(mar.flete * contenedores) };
        totalesOrigen.flete = 'maestro';
        ajustes.push(
          `Flete marítimo de la tabla de fletes: ${mar.origen} → ${mar.destino} (${[mar.forwarder, mar.naviera].filter(Boolean).join(' / ')}, contenedor 40'), USD ${mar.flete.toFixed(2)}${porContenedores}.` +
            (mar.vencida ? ` OJO: esa tarifa venció el ${mar.validUntil} — pedir la actualización a COMEX.` : ''),
        );
      } else if (prov) {
        totales = { ...totales, flete: 0 };
        totalesOrigen.flete = 'provisional';
        const ruta = [header.puertoEmbarque, puertoInland ?? header.puertoArribo].filter((v) => typeof v === 'string' && v).join(' → ');
        ajustes.push(`Flete marítimo en 0: no hay tarifa en la tabla de fletes${ruta ? ` para ${ruta}` : ''}. Pedir la cotización a COMEX o digitarlo.`);
      }
    }
    // Partida arancelaria por tipo de película (tabla de Oben, 2026-10-02); lo digitado manda.
    // El tipo sale de Linea/TipoMaterial que entrega Oben por SKU; la familia del código es respaldo.
    const { partida, sinPartida, mezcla } = partidaComun(
      check.Detalle.map((l) => ({ codigo: l.TipoPelicula, linea: l.Linea, tipoMaterial: l.TipoMaterial })),
    );
    // COMEX (María Escobar, 6-oct): en el encabezado va la partida arancelaria de COLOMBIA (la que Oben
    // entrega por SKU en `Parida`); el NCM/NALADI de destino depende del país y no va en Pa_Ncm.
    if (paridaComun) {
      if (this.isBlank(header.paNcm)) {
        header.paNcm = paridaComun;
        headerOrigen.paNcm = 'oben';
        ajustes.push(`Partida arancelaria de Colombia (Parida del SKU, según Oben): ${paridaComun}.`);
      }
    } else if (paridaMezcla) {
      ajustes.push(
        `La PF mezcla SKU con partidas distintas (${paridasDistintas.join(', ')}): el encabezado lleva una sola partida, digítala (o separa la liquidación).`,
      );
    }
    if (partida) {
      // Sin Parida de Oben, la tabla por tipo de película sigue siendo el respaldo del NCM.
      if (!paridaComun && !paridaMezcla && this.isBlank(header.paNcm)) {
        header.paNcm = partida.ncm;
        headerOrigen.paNcm = 'maestro';
      }
      if (this.isBlank(header.paNaladi) && partida.naladi) {
        header.paNaladi = partida.naladi;
        headerOrigen.paNaladi = 'maestro';
      }
      if (headerOrigen.paNcm === 'maestro') {
        ajustes.push(`Partida arancelaria de la tabla de Oben: ${partida.ncm} — ${partida.descripcionEs}.`);
      }
    } else if (mezcla && !paridaComun && !paridaMezcla) {
      ajustes.push(
        'La PF mezcla películas de partidas distintas (Jorge confirmó que puede pasar): el encabezado lleva una sola partida, digítala (o separa la liquidación).',
      );
    } else if (sinPartida.length && !paridaComun && !paridaMezcla) {
      ajustes.push(
        `Sin tipo de película para: ${[...new Set(sinPartida)].join(', ')} (Oben no entregó la Linea del SKU y su familia no está en la tabla).`,
      );
    }
    // Arancel de importación (Jorge, 2026-10-05): en destino no se paga, salvo EE. UU. (12,5 %).
    // Solo se informa: no entra en la liquidación hasta confirmar su base.
    if (esUSA) {
      ajustes.push(
        `Arancel de importación EE. UU.: ${ARANCEL_USA_PCT} % (Jorge, 5-oct). No entra en la liquidación: falta confirmar sobre qué base se calcula, si aplica a todas las películas y si solo cuenta con DDP.`,
      );
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
          `Partida arancelaria PROVISIONAL ${VALORES_PROVISIONALES.partida}: Oben no entregó la partida (Parida) de estos SKU.`,
        );
      }
    }

    const calcular = (t: LiquidacionTotalesInput) => {
      const r = this.calcularLineas(baseLines, lineasDigitadas, (l, indice) =>
        this.calculator.compute({ ...envio, indice, pais, esUSA, incoterm, totales: t, line: l }),
      );
      // José: si por los decimales la suma queda por debajo del valor de la mercancía, al último ítem se le
      // resta 0.0001 al flete por unidad y se le suma al precio final (el FOB final = precio final × kilos
      // sube). El flete en dólares NO se toca (Hernán, 16-oct). Si el usuario sobrescribió el último ítem, manda lo suyo.
      const ultimo = baseLines.at(-1);
      const pasosAjuste = ultimo && !lineasDigitadas?.[String(ultimo.codSecLineFilm)] ? noQuedarPorDebajo(r.lines) : 0;
      return { ...r, pasosAjuste };
    };
    // USA con DAP/DDP sin "otros costos destino" digitados: la primera pasada
    // usa 0 para poder calcular el FOB (y con él el HMF); después se toman de
    // Destination Charges. Si no se puede (faltan cargos), se recalcula sin el 0.
    const otrosPendientesUSA = esUSA && !!conceptos?.includes('otrosGastos') && !isNum(totales.otrosGastos);
    let calculo = calcular(otrosPendientesUSA ? { ...totales, otrosGastos: 0 } : totales);
    const sinConfirmar = [...(this.calculator.sinConfirmar ?? [])];

    if (esUSA && pais) {
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
      // Con DAP/DDP el FOB final ya tiene descontados los gastos de destino, incluido el propio HMF:
      // HMF = pct × FOB final = pct × (FOB sin gastos de destino − Inland − Entry − ISF − HMF)
      //     → HMF = pct × (FOB sin gastos de destino − Inland − Entry − ISF) ÷ (1 + pct).
      // PF 11237 (15-oct): 44.34, igual que Oben; sobre el FOB sin descontarlos daba 45.68.
      const pct = s.harborMaintenanceFeePct;
      if (headerOrigen.harborMaintenanceFee === 'maestro' && isNum(pct) && conceptos?.includes('otrosGastos')) {
        const fobSinDestino = this.sumaFOB((otrosPendientesUSA ? calculo : calcular({ ...totales, otrosGastos: 0 })).lines);
        const fijos = [header.inlandFreight, header.entryFee, header.importerSecurityFiling];
        const base = isNum(fobSinDestino) && fijos.every(isNum) ? fobSinDestino - fijos.reduce((a, b) => a + b, 0) : null;
        // Con base ≤ 0 (los gastos superan la mercancía) el FOB queda negativo y la liquidación se bloquea igual.
        if (isNum(base) && base > 0) {
          header.harborMaintenanceFee = round2((pct * base) / (1 + pct));
          ajustes.push(
            `Harbor Maintenance Fee = ${(pct * 100).toFixed(3)} % del FOB final (ya sin Inland, Entry, ISF ni el propio HMF): USD ${header.harborMaintenanceFee.toFixed(2)}.`,
          );
        }
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
        totalesOrigen.otrosGastos = 'calculado';
        calculo = calcular(totales);
      } else if (otrosPendientesUSA) {
        calculo = calcular(totales);
      } else if (isNum(dc) && conceptos && !conceptos.includes('otrosGastos')) {
        sinConfirmar.push(
          `Destino USA con ${incoterm} (no lleva otros gastos): Destination Charges (USD ${dc.toFixed(2)}) va en el encabezado pero no se descuenta de la mercancía — confirmar con José.`,
        );
      }
    }

    if (calculo.pasosAjuste > 0) {
      const ultima = calculo.lines.at(-1)!;
      ajustes.push(
        `Redondeo (José, 15-oct): al último ítem (línea ${ultima.codSecLineFilm}) se le restaron ${(calculo.pasosAjuste * 0.0001).toFixed(4)} al flete por unidad y se sumaron al precio final, para que la liquidación no quede por debajo del valor de la mercancía.`,
      );
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

    // Comisión aduanera (pata 3): la del transportador del Inland o, si COMEX la escogió aparte, la de otro agente.
    // Es informativa: Oben NO la suma a Destination Charges (PF 11237: 860 + 120 + 45 + HMF = 1069.34).
    const aduanaComex = guardada?.aduanaId ? (opcionesRuta?.inland.find((o) => o.id === guardada.aduanaId && isNum(o.comisionAduanera)) ?? null) : null;
    const aduanaDe = (id: string | null) => opcionesRuta?.inland.find((o) => o.id === id) ?? null;
    const aduanaActual = aduanaComex ?? aduanaDe(act.inlandId);
    const aduanaSugerida = aduanaDe(sug.inlandId);
    const costoAduana = (o: { comisionAduanera: number | null } | null) => (o && isNum(o.comisionAduanera) ? round2(o.comisionAduanera * contenedores) : null);

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
      totalesOrigen,
      lines: calculo.lines.map((l, i) => ({ ...l, descripcion: descripciones[i] || null })),
      ajustes,
      missing,
      readyToSubmit: missing.length === 0,
      aprobacion: null,
      simulated: this.calculator.simulated,
      sinConfirmar,
      partidaTipo: partida,
      descripcionSku,
      terminoPago: typeof check.TerminoPago === 'string' && check.TerminoPago.trim() ? check.TerminoPago.trim() : null,
      factura: this.textoFactura(input, aprobada, preferencia, header.paNcm ?? null, descripcionSku, partida, check.Detalle.map((l) => l.TipoPelicula)),
      partidaOben,
      ruta: opcionesRuta
        ? {
            opciones: opcionesRuta,
            contenedores,
            sugerida: { maritimaId: sug.maritimaId, inlandId: sug.inlandId, aduanaId: aduanaSugerida?.id ?? null, costo: costoRuta(sug, contenedores), costoAduana: costoAduana(aduanaSugerida) },
            actual: {
              maritimaId: act.maritimaId,
              inlandId: act.inlandId,
              aduanaId: aduanaActual?.id ?? null,
              costo: costoRuta(act, contenedores),
              costoAduana: costoAduana(aduanaActual),
              aduanaPorComex: !!aduanaComex,
              escogidaPorComex: !!(maritimaComex || inlandComex || aduanaComex),
              maritimaPorComex: !!maritimaComex,
              inlandPorComex: !!inlandComex,
            },
            sobrecosto:
              isNum(costoRuta(act, contenedores)) && isNum(costoRuta(sug, contenedores))
                ? round2(costoRuta(act, contenedores)! - costoRuta(sug, contenedores)!)
                : null,
            sobrecostoAduana:
              isNum(costoAduana(aduanaActual)) && isNum(costoAduana(aduanaSugerida)) ? round2(costoAduana(aduanaActual)! - costoAduana(aduanaSugerida)!) : null,
            historial: await this.historialRuta(pf),
          }
        : null,
    };
  }

  /**
   * Proformas pendientes de aprobación de COMEX (pedido de Hernán, 16-oct): las de
   * EXPORTACIÓN del reporte de proformas abiertas de Oben que todavía no tienen
   * aprobación en Oben Xmart y, si se pasa `ovsListas`, con alguna OV lista
   * (lista de empaque aprobada en corte). Las más nuevas primero.
   */
  async proformasPendientesComex(ovsListas?: ReadonlySet<number>): Promise<ProformaPendienteComex[]> {
    const res = await this.hub.call<unknown>('obenCostOrder', 'query.run', { procedure: SP_PROFORMAS_COMEX, numberOrderSales: '0' }, OBEN_QUERY_OPTIONS);
    if (!res.ok) throw new BadRequestException(res.error ?? 'Oben no respondió el reporte de proformas.');
    const aprobadas = new Set((this.aprobaciones ? await this.aprobaciones.find({ where: { tenantId: this.ctx.tenantId } }) : []).map((a) => a.numberPF));
    // Las que COMEX ya liquidó por fuera (20-oct, p. ej. la 11166) no son pendientes.
    const descartadas = new Set((this.descartes ? await this.descartes.find({ where: { tenantId: this.ctx.tenantId } }) : []).map((d) => d.numberPF));
    const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return parsearProformasComex(res.data)
      .filter((f) => /EXPORT/i.test(String(f.Mercado ?? '')))
      .map((f) => ({
        numberPF: String(f.NroProforma ?? f.Proforma ?? '').trim(),
        cliente: texto(f.Cliente),
        pais: texto(f.Pais),
        incoterm: texto(f.Incoterms),
        ordenesVenta: (Array.isArray(f.OrdenesVenta) ? (f.OrdenesVenta as Array<Record<string, unknown>>) : [])
          .map((o) => Number(o?.NroOrdenVenta))
          .filter((n) => Number.isInteger(n) && n > 0),
      }))
      .filter((p) => p.numberPF && !aprobadas.has(p.numberPF) && !descartadas.has(p.numberPF))
      // Solo las listas para liquidar: alguna OV con la lista de empaque ya aprobada en corte (Hernán, 16-oct;
      // las demás se buscan a mano por número).
      .filter((p) => !ovsListas || p.ordenesVenta.some((ov) => ovsListas.has(ov)))
      .sort((a, b) => Number(b.numberPF) - Number(a.numberPF));
  }

  /** Ruta vigente que escogió COMEX para la PF (su último cambio), o null = la sugerida. */
  private async rutaGuardada(pf: string): Promise<LiquidacionRuta | null> {
    if (!this.rutas) return null;
    return this.rutas.findOne({ where: { tenantId: this.ctx.tenantId, numberPF: pf }, order: { createdAt: 'DESC', numero: 'DESC' } });
  }

  private async historialRuta(pf: string): Promise<CambioRuta[]> {
    if (!this.rutas) return [];
    const filas = await this.rutas.find({ where: { tenantId: this.ctx.tenantId, numberPF: pf }, order: { createdAt: 'DESC', numero: 'DESC' }, take: 20 });
    const soportes =
      this.adjuntos && filas.length
        ? await this.adjuntos.find({
            where: { tenantId: this.ctx.tenantId, rutaId: In(filas.map((f) => f.id)) },
            select: ['id', 'rutaId', 'nombre', 'tamano'],
            order: { createdAt: 'ASC' },
          })
        : [];
    return filas.map((f) => {
      const d = (f.detalle ?? {}) as { antes?: string; despues?: string; sobrecosto?: number | null };
      return {
        numero: f.numero,
        fecha: f.createdAt.toISOString(),
        por: f.usuarioNombre,
        motivo: f.motivo,
        antes: d.antes ?? '',
        despues: d.despues ?? '',
        sobrecosto: d.sobrecosto ?? null,
        adjuntos: soportes.filter((a) => a.rutaId === f.id).map((a) => ({ id: a.id, nombre: a.nombre, tamano: a.tamano })),
      };
    });
  }

  /**
   * Soportes de la justificación de un cambio de ruta (cotización, correo del
   * booking…; Hernán, 16-oct). Se adjuntan al cambio número `numero` de la PF.
   */
  async adjuntarARuta(
    numberPF: string,
    numero: number,
    archivos: Array<{ originalname: string; mimetype: string; size: number; buffer: Buffer }>,
  ): Promise<CambioRuta[]> {
    if (!this.rutas || !this.adjuntos) throw new BadRequestException('Los adjuntos no están disponibles en este ambiente.');
    const pf = this.parsePF(numberPF);
    const cambio = await this.rutas.findOne({ where: { tenantId: this.ctx.tenantId, numberPF: pf, numero } });
    if (!cambio) throw new BadRequestException(`La PF ${pf} no tiene el cambio de ruta #${numero}.`);
    if (!archivos.length) throw new BadRequestException('No llegó ningún archivo.');
    for (const a of archivos) {
      await this.adjuntos.save(
        this.adjuntos.create({
          tenantId: this.ctx.tenantId,
          rutaId: cambio.id,
          numberPF: pf,
          // multer entrega el nombre en latin1: se pasa a UTF-8 para que las tildes no se dañen.
          nombre: Buffer.from(a.originalname, 'latin1').toString('utf8').slice(0, 255),
          tipo: (a.mimetype || 'application/octet-stream').slice(0, 120),
          tamano: a.size,
          contenido: a.buffer,
          subidoPor: this.ctx.userId ?? null,
        }),
      );
    }
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: 'liquidacion_ruta_adjuntos',
      entityType: 'liquidacion',
      entityId: pf,
      actorId: this.ctx.userId,
      inputData: { numero, archivos: archivos.map((a) => ({ nombre: a.originalname, tamano: a.size })) },
    });
    return this.historialRuta(pf);
  }

  /** Un soporte para descargar (solo de la PF y el tenant indicados). */
  async adjuntoDeRuta(numberPF: string, id: string): Promise<{ nombre: string; tipo: string; contenido: Buffer }> {
    const pf = this.parsePF(numberPF);
    const a = this.adjuntos
      ? await this.adjuntos.findOne({
          where: { tenantId: this.ctx.tenantId, numberPF: pf, id },
          select: ['id', 'nombre', 'tipo', 'contenido'],
        })
      : null;
    if (!a) throw new BadRequestException('Ese adjunto no existe.');
    return { nombre: a.nombre, tipo: a.tipo, contenido: a.contenido };
  }

  /**
   * COMEX escoge la ruta de la PF entre las opciones del tarifario (nunca un
   * valor digitado). Cada cambio queda como orden de compra interna numerada:
   * antes → después, sobrecosto frente a la sugerida, usuario y motivo
   * (opcional, decisión de Hernán). Ids en null = volver a la sugerida. La
   * aprobación anterior deja de valer sola: cambian los valores.
   */
  async cambiarRuta(
    numberPF: string,
    cambio: { maritimaId?: string | null; inlandId?: string | null; aduanaId?: string | null; motivo?: string | null },
    input: LiquidacionInput,
    usuario: { nombre: string | null },
  ): Promise<LiquidacionDraft> {
    if (!this.rutas) throw new BadRequestException('El registro de rutas no está disponible en este ambiente.');
    const pf = this.parsePF(numberPF);
    const antes = await this.armarDraft(pf, input);
    if (!antes.ruta) throw new BadRequestException(`La PF ${pf} no lleva flete ni Inland que escoger con su Incoterm.`);
    const maritimaId = cambio.maritimaId || null;
    const inlandId = cambio.inlandId || null;
    const aduanaId = cambio.aduanaId || null;
    if (aduanaId && !antes.ruta.opciones.inland.some((o) => o.id === aduanaId && isNum(o.comisionAduanera))) {
      throw new BadRequestException('Esa comisión aduanera no es una opción del tarifario para esta PF.');
    }
    if (maritimaId && !antes.ruta.opciones.maritimas.some((o) => o.id === maritimaId)) {
      throw new BadRequestException('Ese flete marítimo no es una opción del tarifario para esta PF.');
    }
    if (inlandId && !antes.ruta.opciones.inland.some((o) => o.id === inlandId)) {
      throw new BadRequestException('Ese Inland no es una opción del tarifario para esta PF.');
    }
    const motivo = cambio.motivo?.trim() || null;
    const fila = await this.rutas.save(
      this.rutas.create({
        tenantId: this.ctx.tenantId,
        numberPF: pf,
        maritimaId,
        inlandId,
        aduanaId,
        motivo,
        usuarioId: this.ctx.userId ?? null,
        usuarioNombre: usuario.nombre,
        detalle: { antes: describirRuta(antes.ruta, antes.ruta.actual) },
      }),
    );
    const despues = await this.getDraft(pf, input);
    const detalle = {
      antes: describirRuta(antes.ruta, antes.ruta.actual),
      despues: despues.ruta ? describirRuta(despues.ruta, despues.ruta.actual) : '',
      sugerida: despues.ruta ? describirRuta(despues.ruta, despues.ruta.sugerida) : '',
      costoAntes: antes.ruta.actual.costo,
      costoDespues: despues.ruta?.actual.costo ?? null,
      sobrecosto: despues.ruta?.sobrecosto ?? null,
      costoAduanaAntes: antes.ruta.actual.costoAduana,
      costoAduanaDespues: despues.ruta?.actual.costoAduana ?? null,
      sobrecostoAduana: despues.ruta?.sobrecostoAduana ?? null,
      contenedores: antes.ruta.contenedores,
    };
    fila.detalle = detalle;
    await this.rutas.save(fila);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: 'liquidacion_ruta_cambiada',
      entityType: 'liquidacion',
      entityId: pf,
      actorId: this.ctx.userId,
      inputData: { maritimaId, inlandId, aduanaId, motivo },
      outputData: detalle,
    });
    // El historial del borrador ya trae este cambio con su detalle completo.
    if (despues.ruta) despues.ruta.historial = await this.historialRuta(pf);
    return despues;
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
    // Servidor de liquidación (pruebas .12) primero; si no tiene la PF (el .12 solo guarda datos de prueba,
    // 15-oct: ya no traía la 11366 ni la 10867), producción — el reporte de proformas real trae el Incoterm.
    for (const target of ['liquidacion', undefined] as const) {
      try {
        const res = await this.hub.call<unknown>(
          'obenCostOrder',
          'query.run',
          { procedure: SP_PROFORMAS_COMEX, numberOrderSales: pf, ...(target ? { target } : {}) },
          INCOTERM_QUERY_OPTIONS,
        );
        if (!res.ok) continue;
        const encontrado = { incoterm: incotermDeProforma(res.data, pf), pais: paisDeProforma(res.data, pf) };
        valor = { incoterm: valor.incoterm ?? encontrado.incoterm, pais: valor.pais ?? encontrado.pais };
        if (valor.incoterm && valor.pais) break;
      } catch {
        /* sin datos de este servidor: se prueba el siguiente */
      }
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
    const draft = await this.armarDraft(numberPF, input);
    // Candados: un borrador con datos SIMULADOS, o calculado con partes de la
    // fórmula que José aún no confirma, nunca escribe en el ERP real de Oben
    // — ni primer envío ni reanudación. Se revisan antes de tocar la
    // idempotencia y antes de cualquier llamada.
    if (options.confirm === true) {
      this.validarEnviable(draft);
      // COMEX aprueba antes de enviar (Hernán, 6-oct): la aprobación es de estos valores exactos.
      if (this.opciones.requiereAprobacion) {
        const est = await this.estadoAprobacion(draft);
        if (!est.existe) {
          throw new ForbiddenException({
            message: 'La liquidación debe aprobarla COMEX antes de enviarse a Oben.',
            requiereAprobacion: true,
          });
        }
        if (!est.vigente) {
          throw new ForbiddenException({
            message: 'La liquidación cambió después de que COMEX la aprobó: debe aprobarse de nuevo antes de enviarse a Oben.',
            requiereAprobacion: true,
          });
        }
      }
    } else if (!draft.readyToSubmit) {
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

  /** Huella de lo que se enviaría a Oben (encabezado + líneas): la aprobación de COMEX vale solo para esta. */
  private huella(draft: LiquidacionDraft): string {
    const orden = (v: unknown): unknown =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, orden(x)]))
        : Array.isArray(v)
          ? v.map(orden)
          : v;
    // El texto de la factura junto a la partida también lo aprueba COMEX; solo entra si cambió (las aprobaciones
    // anteriores al 20-oct siguen valiendo).
    const f = draft.factura;
    const extra = f && (f.ncmDescripcion || f.ncmConDescripcion === false) ? { factura: { ncmDescripcion: f.ncmDescripcion, ncmConDescripcion: f.ncmConDescripcion } } : {};
    return createHash('sha256').update(JSON.stringify(orden({ ...this.buildPayloads(draft), ...extra }))).digest('hex');
  }

  private async estadoAprobacion(draft: LiquidacionDraft): Promise<import('./liquidacion.types').AprobacionEstado> {
    const fila = await this.aprobaciones?.findOne({ where: { tenantId: this.ctx.tenantId, numberPF: draft.numberPF } });
    if (!fila) return { existe: false, vigente: false, por: null, en: null };
    return {
      existe: true,
      vigente: fila.huella === this.huella(draft),
      por: fila.aprobadoPorNombre ?? null,
      en: fila.updatedAt ? new Date(fila.updatedAt).toISOString() : null,
    };
  }

  /** Las mismas condiciones para enviar a Oben y para aprobar: nada simulado, nada sin confirmar, nada faltante. */
  private validarEnviable(draft: LiquidacionDraft): void {
    if (draft.simulated) {
      throw new BadRequestException({
        message:
          'Esta liquidación está SIMULADA (LIQUIDACION_SIMULATION_MODE: datos del envío de ejemplo): se puede simular sin confirm, pero nunca enviarse a Oben.',
        simulated: true,
      });
    }
    if (draft.sinConfirmar.length > 0) {
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
  }

  /**
   * COMEX aprueba los valores que se ven AHORA. Exige `exportations.approve`
   * (lo verifica el controlador). Si después cambia cualquier valor, la
   * aprobación deja de valer y hay que aprobar de nuevo.
   */
  async aprobar(numberPF: string, input: LiquidacionInput, aprobador: { nombre: string | null }): Promise<LiquidacionDraft> {
    if (!this.aprobaciones) throw new BadRequestException('La aprobación de COMEX no está disponible en este ambiente.');
    const draft = await this.armarDraft(numberPF, input);
    this.validarEnviable(draft);
    const tenantId = this.ctx.tenantId;
    const fila =
      (await this.aprobaciones.findOne({ where: { tenantId, numberPF: draft.numberPF } })) ??
      this.aprobaciones.create({ tenantId, numberPF: draft.numberPF });
    fila.huella = this.huella(draft);
    fila.aprobadoPor = this.ctx.userId ?? null;
    fila.aprobadoPorNombre = aprobador.nombre;
    fila.entrada = this.entradaParaGuardar(input, (fila.entrada ?? null) as LiquidacionInput | null);
    await this.aprobaciones.save(fila);
    await this.guardarPreferencia(draft, aprobador.nombre);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: 'liquidacion_aprobada_comex',
      entityType: 'liquidacion',
      entityId: draft.numberPF,
      actorId: this.ctx.userId,
      inputData: { aprobador: aprobador.nombre },
      outputData: { huella: fila.huella, lines: draft.lines.length, header: draft.header },
    });
    draft.aprobacion = await this.estadoAprobacion(draft);
    return draft;
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
    const clave = `${this.ctx.tenantId}:${n}`;
    const cache = this.paisCache.get(clave);
    if (cache && cache.hasta > Date.now()) return cache.pais;
    // La Lista de Empaque es un reporte de PRODUCCIÓN (no del servidor de liquidación).
    try {
      const res = await this.hub.call<Record<string, unknown>>(
        'obenCostOrder',
        'query.run',
        { procedure: 'spEmpaqueUnificada_Paradixe', numberOrderSales: n },
        OBEN_QUERY_OPTIONS,
      );
      const pais = String((res.ok ? res.data : null)?.Pais ?? '').trim();
      if (pais) this.paisCache.set(clave, { pais, hasta: Date.now() + INCOTERM_CACHE_MS });
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

  /** Lo que COMEX dejó al aprobar la PF (null si nunca se aprobó o la aprobación es anterior al 20-oct). */
  private async entradaAprobada(pf: string): Promise<LiquidacionInput | null> {
    if (!this.aprobaciones) return null;
    const fila = await this.aprobaciones.findOne({ where: { tenantId: this.ctx.tenantId, numberPF: pf } });
    return (fila?.entrada as LiquidacionInput | null | undefined) ?? null;
  }

  /** Lo digitado al aprobar, encima de lo que ya se había guardado (sin vacíos: nada se borra por omisión). */
  private entradaParaGuardar(input: LiquidacionInput, anterior: LiquidacionInput | null): Record<string, unknown> {
    const header = { ...soloDigitado(anterior?.header), ...soloDigitado(input.header) };
    const totales = { ...soloDigitado(anterior?.totales), ...soloDigitado(input.totales) };
    const factura = { ...soloDigitado(anterior?.factura), ...soloDigitado(input.factura) };
    const lines = input.lines ?? anterior?.lines;
    return { header, totales, factura, ...(lines ? { lines } : {}) };
  }

  private async preferenciaDe(cliente: string | null | undefined, partidaOben: string): Promise<LiquidacionPreferenciaCliente | null> {
    const clave = claveCliente(cliente);
    if (!this.preferencias || !clave) return null;
    try {
      return await this.preferencias.findOne({ where: { tenantId: this.ctx.tenantId, clienteClave: clave, partidaOben } });
    } catch (err) {
      this.logger.warn(`No se pudieron leer las preferencias del cliente ${clave}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Texto que va junto a la partida NCM en la factura: lo digitado → lo aprobado → lo del cliente → el de Oben. */
  private textoFactura(
    input: LiquidacionInput,
    aprobada: LiquidacionInput | null,
    preferencia: LiquidacionPreferenciaCliente | null,
    ncm: string | null,
    descripcionSku: string | null,
    partida: import('./partidas-arancelarias').PartidaArancelaria | null,
    tipos: string[],
  ): NonNullable<LiquidacionDraft['factura']> {
    const primero = <T>(...c: Array<[T | null | undefined, OrigenValor]>) =>
      c.find(([v]) => v !== null && v !== undefined && !(typeof v === 'string' && !v.trim())) ?? null;
    const d = primero<string>([input.factura?.ncmDescripcion, 'usuario'], [aprobada?.factura?.ncmDescripcion, 'comex'], [preferencia?.ncmDescripcion, 'cliente']);
    const c = primero<boolean>([input.factura?.ncmConDescripcion, 'usuario'], [aprobada?.factura?.ncmConDescripcion, 'comex'], [preferencia?.ncmConDescripcion, 'cliente']);
    const porDefecto = descripcionNcm(ncm, descripcionSku, partida ?? descripcionPartida(ncm, tipos)).trim() || null;
    return {
      ncmDescripcion: d ? String(d[0]).trim() : null,
      ncmConDescripcion: c ? c[0] !== false : true,
      ncmDescripcionPorDefecto: porDefecto,
      origen: d?.[1] ?? c?.[1] ?? null,
    };
  }

  /** Al aprobar: lo que COMEX dejó distinto de Oben queda como preferencia del cliente para esa partida. */
  private async guardarPreferencia(draft: LiquidacionDraft, por: string | null): Promise<void> {
    const clave = claveCliente(draft.cliente);
    if (!this.preferencias || !clave) return;
    const propio = (o: OrigenValor | null | undefined) => o === 'usuario' || o === 'comex' || o === 'cliente';
    const paNcm = propio(draft.headerOrigen.paNcm) ? (draft.header.paNcm ?? null) : null;
    const paNaladi = propio(draft.headerOrigen.paNaladi) ? (draft.header.paNaladi ?? null) : null;
    const f = draft.factura;
    const conTexto = !!f && propio(f.origen);
    if (!paNcm && !paNaladi && !conTexto) return;
    try {
      const partidaOben = draft.partidaOben ?? '';
      const fila =
        (await this.preferencias.findOne({ where: { tenantId: this.ctx.tenantId, clienteClave: clave, partidaOben } })) ??
        this.preferencias.create({ tenantId: this.ctx.tenantId, clienteClave: clave, partidaOben });
      Object.assign(fila, {
        cliente: draft.cliente,
        paNcm,
        paNaladi,
        ncmDescripcion: conTexto ? (f!.ncmDescripcion ?? null) : null,
        ncmConDescripcion: conTexto ? f!.ncmConDescripcion : null,
        numberPF: draft.numberPF,
        actualizadoPor: por,
      });
      await this.preferencias.save(fila);
    } catch (err) {
      this.logger.warn(`PF ${draft.numberPF}: no se pudo guardar la preferencia del cliente: ${(err as Error).message}`);
    }
  }

  /** COMEX ya la liquidó por fuera: sale de la lista de pendientes (se puede seguir abriendo por número). */
  async descartarPendiente(numberPF: string, motivo: string | null, usuario: { nombre: string | null }): Promise<{ numberPF: string; descartada: boolean }> {
    const pf = this.parsePF(numberPF);
    if (!this.descartes) throw new BadRequestException('No disponible en este ambiente.');
    const tenantId = this.ctx.tenantId;
    const fila = (await this.descartes.findOne({ where: { tenantId, numberPF: pf } })) ?? this.descartes.create({ tenantId, numberPF: pf });
    Object.assign(fila, { motivo: motivo?.trim() || null, usuarioId: this.ctx.userId ?? null, usuarioNombre: usuario.nombre });
    await this.descartes.save(fila);
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: 'liquidacion_pendiente_descartada',
      entityType: 'liquidacion',
      entityId: pf,
      actorId: this.ctx.userId,
      inputData: { motivo: fila.motivo, usuario: usuario.nombre },
    });
    return { numberPF: pf, descartada: true };
  }

  async restaurarPendiente(numberPF: string): Promise<{ numberPF: string; descartada: boolean }> {
    const pf = this.parsePF(numberPF);
    if (this.descartes) await this.descartes.delete({ tenantId: this.ctx.tenantId, numberPF: pf });
    return { numberPF: pf, descartada: false };
  }

  /**
   * La proforma tal como la tiene Oben (María, 20-oct: "cuando vamos a liquidar consultamos la proforma"):
   * encabezado y detalle de spCheckSettlement y la fila del reporte de proformas COMEX. Solo lectura.
   */
  async proformaCompleta(numberPF: string): Promise<{ numberPF: string; campos: Record<string, unknown>; detalle: Array<Record<string, unknown>>; reporte: Record<string, unknown> | null }> {
    const pf = this.parsePF(numberPF);
    const check = await this.fetchCheck(pf);
    const { Detalle, ...campos } = check;
    let reporte: Record<string, unknown> | null = null;
    for (const target of [undefined, 'liquidacion'] as const) {
      try {
        const res = await this.hub.call<unknown>('obenCostOrder', 'query.run', { procedure: SP_PROFORMAS_COMEX, numberOrderSales: pf, ...(target ? { target } : {}) }, INCOTERM_QUERY_OPTIONS);
        if (!res.ok) continue;
        reporte = parsearProformasComex(res.data).find((r) => String(r.NroProforma ?? r.Proforma ?? '').trim() === pf) ?? null;
        if (reporte) break;
      } catch {
        /* se prueba el siguiente servidor */
      }
    }
    return { numberPF: pf, campos, detalle: Detalle as unknown as Array<Record<string, unknown>>, reporte };
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
