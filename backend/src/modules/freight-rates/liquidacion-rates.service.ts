import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { FreightDestinationSurcharge } from '../../entities/freight-destination-surcharge.entity';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';

export interface LiquidacionSurchargesResult {
  entryFee: number | null;
  importerSecurityFiling: number | null;
  harborMaintenanceFee: number | null;
  harborMaintenanceFeeFormula: string | null;
  destinationCharges: null;
  missing: string[];
}

export interface LiquidacionInlandFreightResult {
  inlandFreight: number | null;
  missing: string[];
}

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
  ) {}

  /**
   * `country` es el mismo texto que ya trae el campo real "Pais" de
   * spEmpaqueUnificada_Paradixe/spEmpaqueDetallada_Paradixe (ej. "PERU",
   * "COLOMBIA") — coincide (salvo mayúsculas) con los encabezados de país de
   * la hoja "Destination Surcharges" del Excel real de Oben.
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

    let harborMaintenanceFee: number | null = harbor?.rateAmount ?? null;
    if (harborMaintenanceFee === null && harbor?.rateFormula) {
      const pct = this.parsePercentFormula(harbor.rateFormula);
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
      entryFee: entry?.rateAmount ?? null,
      importerSecurityFiling: isf?.rateAmount ?? null,
      harborMaintenanceFee,
      harborMaintenanceFeeFormula: harbor?.rateFormula ?? null,
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
    return { inlandFreight: row.rate40hc, missing: [] };
  }

  private parsePercentFormula(formula: string): number | null {
    const m = formula.match(/([\d.,]+)\s*%/);
    if (!m) return null;
    return parseFloat(m[1].replace(',', '.')) / 100;
  }
}
