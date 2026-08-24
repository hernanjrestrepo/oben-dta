import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';
import { FreightTransloadRate } from '../../entities/freight-transload-rate.entity';
import { FreightDestinationSurcharge } from '../../entities/freight-destination-surcharge.entity';

export interface ParsedInlandRow {
  country: 'USA' | 'CA';
  forwarder: string;
  destinationPort: string;
  state: string;
  destinationAddress: string;
  weightLbs: number | null;
  rate40hc: number;
  transitTimeDays: number | null;
  validUntil: string | null;
}

export interface ParsedTransloadRow {
  destinationPort: string | null;
  deliveryAddress: string;
  unitWeightLbs: number | null;
  transloadingRate: number;
  transportationRate: number;
  validityNote: string | null;
}

export interface ParsedSurchargeRow {
  country: string;
  surchargeName: string;
  rateAmount: number | null;
  rateFormula: string | null;
}

export interface ParsedFreightRates {
  inland: ParsedInlandRow[];
  transload: ParsedTransloadRow[];
  surcharges: ParsedSurchargeRow[];
}

export interface FreightImportResult {
  sourceFile: string;
  inlandCount: number;
  transloadCount: number;
  surchargeCount: number;
  importedAt: Date;
}

const KNOWN_FORWARDERS = new Set(['Shapiro']);

/**
 * Parsea y carga el maestro de tarifas de flete que Oben envía por correo
 * como adjunto Excel (ej. "Oben - Leg 3_USA Rates August 2026.xlsx").
 *
 * El archivo real trae, además de las filas de tarifas, un bloque grande de
 * texto legal/disclaimer pegado en la misma columna del forwarder (hasta
 * ~1000 filas de términos y condiciones) — por eso el filtro estricto por
 * `KNOWN_FORWARDERS` en vez de "cualquier fila con datos": una fila de
 * disclaimer no es un forwarder conocido y se descarta, no se importa como
 * basura silenciosa.
 *
 * Carga "reemplazo completo por tenant": cada archivo nuevo de Oben
 * reemplaza el maestro anterior completo (son tarifas vigentes a una fecha,
 * no un histórico acumulativo) — `sourceFile`/`importedAt` quedan como
 * rastro de auditoría de cuál archivo dejó los datos actuales.
 */
@Injectable()
export class FreightRateImportService {
  private readonly logger = new Logger(FreightRateImportService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FreightInlandRate)
    private readonly inlandRepo: Repository<FreightInlandRate>,
    @InjectRepository(FreightTransloadRate)
    private readonly transloadRepo: Repository<FreightTransloadRate>,
    @InjectRepository(FreightDestinationSurcharge)
    private readonly surchargeRepo: Repository<FreightDestinationSurcharge>,
  ) {}

  parseWorkbook(buffer: Buffer): ParsedFreightRates {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    return {
      inland: [
        ...this.parseInlandSheet(wb, 'Inland', 'USA'),
        ...this.parseInlandSheet(wb, 'Canada', 'CA'),
      ],
      transload: this.parseTransloadSheet(wb),
      surcharges: this.parseSurchargeSheet(wb),
    };
  }

  private sheetRows(wb: XLSX.WorkBook, sheetName: string): unknown[][] {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });
  }

  private parseInlandSheet(
    wb: XLSX.WorkBook,
    sheetName: string,
    country: 'USA' | 'CA',
  ): ParsedInlandRow[] {
    const rows = this.sheetRows(wb, sheetName).slice(1); // skip header
    const out: ParsedInlandRow[] = [];
    for (const row of rows) {
      const forwarder = typeof row[0] === 'string' ? row[0].trim() : '';
      if (!KNOWN_FORWARDERS.has(forwarder)) continue;
      const rate = row[5];
      if (typeof rate !== 'number') continue;

      out.push({
        country,
        forwarder,
        destinationPort: String(row[1] ?? '').trim(),
        state: String(row[2] ?? '').trim(),
        destinationAddress: String(row[3] ?? '').trim(),
        weightLbs: typeof row[4] === 'number' ? row[4] : null,
        rate40hc: rate,
        transitTimeDays: typeof row[6] === 'number' ? row[6] : null,
        validUntil: this.toIsoDate(row[7]),
      });
    }
    return out;
  }

  private parseTransloadSheet(wb: XLSX.WorkBook): ParsedTransloadRow[] {
    const rows = this.sheetRows(wb, 'Transload').slice(1);
    const out: ParsedTransloadRow[] = [];
    for (const row of rows) {
      const deliveryAddress = row[2];
      if (typeof deliveryAddress !== 'string' || !deliveryAddress.trim()) continue;
      const transloadingRate = row[4];
      const transportationRate = row[5];
      if (typeof transloadingRate !== 'number' || typeof transportationRate !== 'number') continue;

      out.push({
        destinationPort: typeof row[0] === 'string' ? row[0].trim() : null,
        deliveryAddress: deliveryAddress.replace(/ /g, ' ').trim(),
        unitWeightLbs: typeof row[3] === 'number' ? row[3] : null,
        transloadingRate,
        transportationRate,
        validityNote: typeof row[6] === 'string' ? row[6].trim() : null,
      });
    }
    return out;
  }

  private parseSurchargeSheet(wb: XLSX.WorkBook): ParsedSurchargeRow[] {
    const rows = this.sheetRows(wb, 'Destination Surcharges').slice(1);
    const out: ParsedSurchargeRow[] = [];
    let currentCountry: string | null = null;

    for (const row of rows) {
      const rawName = row[0];
      if (rawName === null || rawName === undefined) continue;
      const name = String(rawName).replace(/ /g, ' ').replace(/:\s*$/, '').trim();
      if (!name) continue;

      const rate = row[1];
      if (rate === null || rate === undefined) {
        // Encabezado de país, o subtítulo tipo "Only Inland (Shapiro)" que
        // se descarta sin cambiar el país actual.
        if (!/inland/i.test(name)) currentCountry = name;
        continue;
      }

      if (!currentCountry) continue;
      const rateAmount = typeof rate === 'number' ? rate : null;
      const rateFormula =
        typeof rate === 'string' ? rate.replace(/ /g, ' ').trim() : null;
      out.push({ country: currentCountry, surchargeName: name, rateAmount, rateFormula });
    }
    return out;
  }

  private toIsoDate(value: unknown): string | null {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return null;
  }

  /**
   * Reemplaza el maestro completo de un tenant en una sola transacción
   * (todo-o-nada: si falla a mitad de camino, no deja el maestro a medias).
   */
  async replaceAll(
    tenantId: string,
    sourceFile: string,
    parsed: ParsedFreightRates,
  ): Promise<FreightImportResult> {
    const importedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(FreightInlandRate, { tenantId });
      await manager.delete(FreightTransloadRate, { tenantId });
      await manager.delete(FreightDestinationSurcharge, { tenantId });

      if (parsed.inland.length) {
        await manager.insert(
          FreightInlandRate,
          parsed.inland.map((r) => ({ ...r, tenantId, sourceFile, importedAt })),
        );
      }
      if (parsed.transload.length) {
        await manager.insert(
          FreightTransloadRate,
          parsed.transload.map((r) => ({ ...r, tenantId, sourceFile, importedAt })),
        );
      }
      if (parsed.surcharges.length) {
        await manager.insert(
          FreightDestinationSurcharge,
          parsed.surcharges.map((r) => ({ ...r, tenantId, sourceFile, importedAt })),
        );
      }
    });

    this.logger.log(
      `Maestro de fletes reemplazado (tenant ${tenantId}): ${parsed.inland.length} inland, ${parsed.transload.length} transload, ${parsed.surcharges.length} recargos. Fuente: ${sourceFile}`,
    );

    return {
      sourceFile,
      inlandCount: parsed.inland.length,
      transloadCount: parsed.transload.length,
      surchargeCount: parsed.surcharges.length,
      importedAt,
    };
  }
}
