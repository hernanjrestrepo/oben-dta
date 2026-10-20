import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { FreightDestinationSurcharge } from '../../entities/freight-destination-surcharge.entity';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';
import { FreightOceanRate } from '../../entities/freight-ocean-rate.entity';

export interface LiquidacionSurchargesResult {
  entryFee: number | null;
  importerSecurityFiling: number | null;
  harborMaintenanceFee: number | null;
  harborMaintenanceFeeFormula: string | null;
  /** La fórmula del HMF como fracción ("0.125% del FOB" → 0.00125), o null si no hay fórmula. */
  harborMaintenanceFeePct?: number | null;
  destinationCharges: null;
  missing: string[];
}

export interface LiquidacionInlandFreightResult {
  inlandFreight: number | null;
  missing: string[];
}

/** Una tarifa marítima (pata 2) que Comex puede escoger para la PF. */
export interface OpcionMaritima {
  id: string;
  origen: string;
  destino: string;
  forwarder: string | null;
  naviera: string | null;
  /** Puerto de transbordo ("New York, NJ…"), si lo hay. */
  transito: string | null;
  dias: number | null;
  /** USD por contenedor de 40'. */
  flete: number;
  validUntil: string | null;
  vencida: boolean;
}

/** Una tarifa de Inland (pata 3) que Comex puede escoger para la PF. */
export interface OpcionInland {
  id: string;
  forwarder: string | null;
  /** Puerto o rampa de donde sale el camión (empalma con el destino del marítimo). */
  puerto: string;
  direccion: string;
  /** USD por contenedor de 40'. */
  valor: number;
  /** Comisión aduanera de este transportador (USD por contenedor), si el archivo la trae. */
  comisionAduanera: number | null;
  validUntil: string | null;
  vencida: boolean;
}

export interface OpcionesDeRuta {
  maritimas: OpcionMaritima[];
  inland: OpcionInland[];
}

/** Inland Freight resuelto por la dirección de destino (código postal) contra la tabla de fletes. */
export interface LiquidacionInlandByAddressResult {
  /** Fila del tarifario escogida (para mostrarla como "sugerida"). */
  id?: string | null;
  inlandFreight: number | null;
  /** Transportador terrestre (Shapiro, Trading, Transborder…). */
  forwarder?: string | null;
  destinationPort: string | null;
  destinationAddress: string | null;
  validUntil: string | null;
  /** true si la tarifa ya venció (se usa igual, pero se avisa). */
  vencida: boolean;
}

/** Flete marítimo (pata 2) de la tabla de fletes, por puerto de embarque y puerto/rampa de destino. */
export interface LiquidacionOceanFreightResult {
  /** Fila del tarifario escogida (para mostrarla como "sugerida"). */
  id?: string | null;
  /** USD por contenedor de 40'. */
  flete: number | null;
  origen: string | null;
  destino: string | null;
  forwarder: string | null;
  naviera: string | null;
  validUntil: string | null;
  vencida: boolean;
}

/**
 * Postgres devuelve las columnas `decimal` como TEXTO ("110.0000"): sin esta
 * conversión la liquidación (que exige números) los trataba como faltantes.
 */
const toAmount = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
/**
 * Una tarifa de flete en 0 no es una tarifa (20-oct: el archivo de octubre trae Cartagena → New Orleans de
 * Transborder en 0 y sin vencimiento; como se sugiere la más barata vigente, la liquidación salía con flete 0).
 */
const tarifa = (v: unknown): number | null => {
  const n = toAmount(v);
  return n !== null && n > 0 ? n : null;
};

const ENTRY_FEE_NAME = 'Entry Fee';
const ISF_NAME = 'Importer Security Filing';
const HARBOR_FEE_NAME = 'Harbor Maintenance Fee';

/**
 * Resuelve, a partir del maestro real de tarifas de flete que ya importamos
 * de Oben (freight_destination_surcharges, freight_inland_rates — cargado
 * por FreightRateImportService desde el Excel real del forwarder), los
 * parámetros en dólares que pide `spSettlement_Head`: @EntryFee,
 * @ImporterSecurityFiling, @HarborMaintenanceFee, @InlandFreight y
 * @DestinationCharges (ver Preguntas_y_Requerimientos_Liquidacion_Oben.pdf,
 * pregunta 9, enviado a José el 2026-09-10 — todavía sin responder).
 *
 * Principio: NUNCA fabricar un valor. Lo que no tiene una fuente real
 * confirmada en nuestros datos queda explícitamente en `null`, con el motivo
 * en `missing` — eso es lo que sigue dependiendo de la respuesta de José, no
 * algo que debamos adivinar para "completar" la liquidación.
 */
@Injectable()
export class LiquidacionRatesService {
  constructor(
    @InjectRepository(FreightDestinationSurcharge)
    private readonly surcharges: Repository<FreightDestinationSurcharge>,
    @InjectRepository(FreightInlandRate)
    private readonly inlandRates: Repository<FreightInlandRate>,
    @InjectRepository(FreightOceanRate)
    private readonly oceanRates?: Repository<FreightOceanRate>,
  ) {}

  /**
   * `country` es el país de ORIGEN de la ruta hacia USA: la hoja
   * "Destination Surcharges" del forwarder trae los cargos de importación de
   * USA (Entry Fee, ISF, HMF…) por país de origen (Brazil, Colombia, El
   * Salvador, Peru — verificado en prod el 2026-10-01; no hay fila "USA").
   * Para Oben Colombia, LiquidacionService pasa "Colombia".
   *
   * `fobValue`, si se conoce, permite calcular Harbor Maintenance Fee cuando
   * la tarifa viene como fórmula ("0.125% del FOB") en vez de monto fijo —
   * ese FOB es a su vez otro valor sin fuente confirmada todavía (pregunta
   * 11), así que sin él la fórmula queda expuesta mas no calculada.
   */
  async resolveSurcharges(
    tenantId: string,
    country: string,
    fobValue?: number,
  ): Promise<LiquidacionSurchargesResult> {
    const rows = await this.surcharges.find({ where: { tenantId, country: ILike(country) } });
    const find = (name: string) =>
      rows.find((r) => r.surchargeName.toLowerCase() === name.toLowerCase());

    const entry = find(ENTRY_FEE_NAME);
    const isf = find(ISF_NAME);
    const harbor = find(HARBOR_FEE_NAME);

    const missing: string[] = [];
    if (!entry) missing.push(`Entry Fee: no hay tarifa cargada para "${country}" en el maestro de fletes.`);
    if (!isf) missing.push(`Importer Security Filing: no hay tarifa cargada para "${country}" en el maestro de fletes.`);
    if (!harbor) missing.push(`Harbor Maintenance Fee: no hay tarifa cargada para "${country}" en el maestro de fletes.`);

    let harborMaintenanceFee: number | null = toAmount(harbor?.rateAmount);
    const harborPct = harbor?.rateFormula ? this.parsePercentFormula(harbor.rateFormula) : null;
    if (harborMaintenanceFee === null && harbor?.rateFormula) {
      const pct = harborPct;
      if (pct !== null && fobValue !== undefined) {
        harborMaintenanceFee = Math.round(fobValue * pct * 10_000) / 10_000;
      } else if (pct !== null) {
        missing.push(
          `Harbor Maintenance Fee: fórmula "${harbor.rateFormula}" encontrada, pero falta el valor FOB de la orden para calcularla.`,
        );
      }
    }

    missing.push(
      'Destination Charges: sin fuente conocida en nuestros datos todavía — pendiente de confirmación con José (pregunta 9).',
    );

    return {
      entryFee: toAmount(entry?.rateAmount),
      importerSecurityFiling: toAmount(isf?.rateAmount),
      harborMaintenanceFee,
      harborMaintenanceFeeFormula: harbor?.rateFormula ?? null,
      // Con monto fijo no hay porcentaje que aplicar.
      harborMaintenanceFeePct: toAmount(harbor?.rateAmount) !== null ? null : harborPct,
      destinationCharges: null,
      missing,
    };
  }

  /**
   * A diferencia de los recargos (por país completo), Inland Freight se
   * cotiza por puerto/estado de destino dentro de USA/Canadá
   * (freight_inland_rates) — y ningún reporte real de Oben que consultamos
   * hasta ahora (Lista Especial, Empaque Unificada/Detallada) trae ese dato
   * por orden, así que sin `destinationPort` esto queda sin resolver (no es
   * un límite de esta tabla, es un dato que todavía no sabemos de dónde sale
   * por orden — pregunta 9).
   */
  async resolveInlandFreight(
    tenantId: string,
    country: 'USA' | 'CA',
    destinationPort?: string,
  ): Promise<LiquidacionInlandFreightResult> {
    if (!destinationPort) {
      return {
        inlandFreight: null,
        missing: [
          'Inland Freight: requiere el puerto/estado de destino del envío — ningún reporte real de Oben que consultamos lo trae por orden todavía (pendiente de confirmación con José, pregunta 9).',
        ],
      };
    }
    const row = await this.inlandRates.findOne({
      where: { tenantId, country, destinationPort: ILike(destinationPort) },
    });
    if (!row) {
      return {
        inlandFreight: null,
        missing: [`Inland Freight: no hay tarifa cargada para "${destinationPort}" (${country}) en el maestro de fletes.`],
      };
    }
    return { inlandFreight: toAmount(row.rate40hc), missing: [] };
  }

  /**
   * Inland Freight por la DIRECCIÓN de destino que ya trae Oben
   * (spCheckSettlement → "Direccion"/"PuertoArribo", p. ej. "... Dallas TX
   * 75212"): se busca su código postal en la tabla del forwarder
   * (destination_address "Dallas, TX 75212" → Houston, TX (Port), 40HC).
   * Sin código postal o sin fila que lo contenga, no se inventa nada.
   */
  async resolveInlandByAddress(
    tenantId: string,
    country: 'USA' | 'CA',
    address?: string | null,
    hoy: Date = new Date(),
    puertoArribo?: unknown,
  ): Promise<LiquidacionInlandByAddressResult> {
    const vacio = { inlandFreight: null, destinationPort: null, destinationAddress: null, validUntil: null, vencida: false };
    const zips = [...new Set((address ?? '').match(/\b\d{5}\b/g) ?? [])];
    const ciudadArribo = ciudadDe(puertoArribo)?.toLowerCase() ?? null;
    for (const zip of zips) {
      const todas = (
        await this.inlandRates.find({
          where: { tenantId, country, destinationAddress: ILike(`%${zip}%`) },
          take: 50,
        })
      ).filter((r) => tarifa(r.rate40hc) !== null);
      // Si la tabla tiene tarifas desde el puerto/rampa de la ciudad de arribo
      // de la PF, solo esas: la PF 11237 dice Cincinnati y, como el 523 de
      // Shapiro desde Cincinnati había vencido, se fue por la rampa de Columbus
      // (y el marítimo la siguió: 2900 en vez de una tarifa a Cincinnati).
      // Si no tiene (Dallas sale de Houston), todas.
      const delPuerto = ciudadArribo ? todas.filter((r) => ciudadDe(r.destinationPort)?.toLowerCase() === ciudadArribo) : [];
      const rows = delPuerto.length ? delPuerto : todas;
      // Varios forwarders para el mismo ZIP (archivo de fletes oct-2026): primero
      // la tarifa vigente, luego la que sale de PUERTO (la de rampa exige
      // tren hasta la rampa), y entre esas la más barata.
      const hoyIso = hoy.toISOString().slice(0, 10);
      const vigente = (r: { validUntil: unknown }) => !r.validUntil || String(r.validUntil).slice(0, 10) >= hoyIso;
      const deRampa = (r: { destinationPort: string }) => /ramp/i.test(r.destinationPort ?? '');
      const row = rows
        .sort(
          (a, b) =>
            Number(vigente(b)) - Number(vigente(a)) ||
            Number(deRampa(a)) - Number(deRampa(b)) ||
            (toAmount(a.rate40hc) as number) - (toAmount(b.rate40hc) as number),
        )[0];
      if (!row) continue;
      const validUntil = row.validUntil ? String(row.validUntil).slice(0, 10) : null;
      return {
        ...(row.id ? { id: row.id } : {}),
        inlandFreight: toAmount(row.rate40hc),
        forwarder: row.forwarder ?? null,
        destinationPort: row.destinationPort,
        destinationAddress: row.destinationAddress,
        validUntil,
        vencida: !!validUntil && validUntil < hoy.toISOString().slice(0, 10),
      };
    }
    return vacio;
  }

  /**
   * Flete marítimo (pata 2) desde el puerto de embarque que trae Oben
   * ("CARTAGENA - COLOMBIA"). Destino: primero el puerto del que sale el
   * Inland escogido (`puertoInland`, "Houston, TX (Port)"), para que las patas
   * 2 y 3 empalmen; si no hay, la ciudad del puerto de arribo de Oben. Solo
   * contenedor de 40' (igual que el Inland); primero la tarifa vigente y entre
   * esas la más barata. Sin fila que coincida, no se inventa nada.
   */
  async resolveOceanFreight(
    tenantId: string,
    puertoEmbarque: unknown,
    puertoInland: string | null,
    puertoArribo: unknown,
    hoy: Date = new Date(),
  ): Promise<LiquidacionOceanFreightResult> {
    const vacio = { flete: null, origen: null, destino: null, forwarder: null, naviera: null, validUntil: null, vencida: false };
    const embarque = ciudadDe(puertoEmbarque);
    if (!embarque || !this.oceanRates) return vacio;
    const arribo = ciudadDe(puertoArribo);
    const destinos = [puertoInland ? ILike(sinComodines(puertoInland)) : null, arribo ? ILike(`${sinComodines(arribo)}%`) : null];
    const hoyIso = hoy.toISOString().slice(0, 10);
    const vigente = (r: { validUntil: unknown }) => !r.validUntil || String(r.validUntil).slice(0, 10) >= hoyIso;
    for (const destinationPort of destinos) {
      if (!destinationPort) continue;
      const rows = await this.oceanRates.find({
        where: { tenantId, origin: ILike(`${sinComodines(embarque)}%`), destinationPort, containerType: ILike('%40%') },
        take: 200,
      });
      const row = rows
        .filter((r) => tarifa(r.rateTotal) !== null)
        .sort((a, b) => Number(vigente(b)) - Number(vigente(a)) || (toAmount(a.rateTotal) as number) - (toAmount(b.rateTotal) as number))[0];
      if (!row) continue;
      const validUntil = row.validUntil ? String(row.validUntil).slice(0, 10) : null;
      return {
        ...(row.id ? { id: row.id } : {}),
        flete: toAmount(row.rateTotal),
        origen: row.origin,
        destino: row.destinationPort,
        forwarder: row.forwarder,
        naviera: row.shippingLine,
        validUntil,
        vencida: !!validUntil && validUntil < hoyIso,
      };
    }
    return vacio;
  }

  /**
   * Todas las tarifas que Comex puede escoger para una PF (reunión del
   * 15-oct: cambia puerto de origen o destino, agente, naviera o transportador
   * terrestre, y la tarifa SIEMPRE sale de aquí, nunca se digita):
   *  - Inland: todas las filas del código postal de destino (cualquier puerto/rampa).
   *  - Marítimas: contenedor de 40' desde cualquier puerto de Colombia hacia
   *    los puertos de donde sale ese Inland y hacia la ciudad de arribo de la PF.
   * Ordenadas de la más barata a la más cara.
   */
  async opcionesDeRuta(
    tenantId: string,
    destino: { direccion?: unknown; puertoArribo?: unknown },
    hoy: Date = new Date(),
  ): Promise<OpcionesDeRuta> {
    const hoyIso = hoy.toISOString().slice(0, 10);
    const fecha = (v: unknown) => (v ? String(v).slice(0, 10) : null);
    const texto = [destino.direccion, destino.puertoArribo].filter((v): v is string => typeof v === 'string').join(' ');
    const zips = [...new Set(texto.match(/\b\d{5}\b/g) ?? [])];

    const inland: OpcionInland[] = [];
    for (const zip of zips) {
      const rows = await this.inlandRates.find({ where: { tenantId, destinationAddress: ILike(`%${zip}%`) }, take: 100 });
      for (const r of rows) {
        const valor = tarifa(r.rate40hc);
        if (valor === null || inland.some((o) => o.id === r.id)) continue;
        const validUntil = fecha(r.validUntil);
        inland.push({ id: r.id, forwarder: r.forwarder ?? null, puerto: r.destinationPort, direccion: r.destinationAddress, valor, comisionAduanera: toAmount(r.customsCommission), validUntil, vencida: !!validUntil && validUntil < hoyIso });
      }
    }

    const maritimas: OpcionMaritima[] = [];
    const ciudadArribo = ciudadDe(destino.puertoArribo);
    const destinos = [...new Set(inland.map((o) => o.puerto))].map((p) => ILike(sinComodines(p)));
    if (ciudadArribo) destinos.push(ILike(`${sinComodines(ciudadArribo)}%`));
    if (this.oceanRates && destinos.length) {
      const rows = await this.oceanRates.find({
        where: destinos.map((destinationPort) => ({ tenantId, origin: ILike('%Colombia%'), destinationPort, containerType: ILike('%40%') })),
        take: 300,
      });
      for (const r of rows) {
        const flete = tarifa(r.rateTotal);
        if (flete === null || maritimas.some((o) => o.id === r.id)) continue;
        const validUntil = fecha(r.validUntil);
        maritimas.push({
          id: r.id,
          origen: r.origin,
          destino: r.destinationPort,
          forwarder: r.forwarder ?? null,
          naviera: r.shippingLine ?? null,
          transito: r.transitPoints || null,
          dias: r.transitDays ?? null,
          flete,
          validUntil,
          vencida: !!validUntil && validUntil < hoyIso,
        });
      }
    }
    return { maritimas: maritimas.sort((a, b) => a.flete - b.flete), inland: inland.sort((a, b) => a.valor - b.valor) };
  }

  private parsePercentFormula(formula: string): number | null {
    const m = formula.match(/([\d.,]+)\s*%/);
    if (!m) return null;
    return parseFloat(m[1].replace(',', '.')) / 100;
  }
}

/**
 * Ciudad de un puerto como lo escribe Oben: "CARTAGENA - COLOMBIA" → "CARTAGENA";
 * "DALLAS, TX 75212" → "DALLAS"; "CINCINNATI OH 45240" (PF 11237, sin coma) → "CINCINNATI".
 */
export function ciudadDe(puerto: unknown): string | null {
  if (typeof puerto !== 'string') return null;
  // Oben escribe "PUERTO GUAYAQUIL" / "PUERTO RIO GRANDE": el prefijo no es parte de la ciudad.
  const ciudad = puerto
    .split(/\s+-\s+|,|\(/)[0]
    .replace(/^\s*PUERTO\s+(DE\s+)?/i, '')
    .replace(/\s+[A-Z]{2}\s+\d{5}(-\d{4})?\s*$/i, '')
    .trim();
  return ciudad.length >= 3 ? ciudad : null;
}

/** El texto va dentro de un LIKE: sus % y _ se escapan. */
function sinComodines(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
