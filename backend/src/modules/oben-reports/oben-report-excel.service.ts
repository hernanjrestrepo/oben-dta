import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

type Row = Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function cellValue(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'string') return v;
  // Arrays/objetos anidados (ej: Detalle1/Detalle2) se serializan — no se
  // pierden datos, solo no quedan en columnas propias. Suficiente para un
  // reporte real y correcto; el formato exacto del Excel legado de Oben
  // (celdas combinadas, plantilla) queda como refinamiento posterior.
  return JSON.stringify(v);
}

function tableFromArray(items: Row[]): (string | number)[][] {
  if (items.length === 0) return [];
  const columns = Array.from(
    items.reduce((set, item) => {
      Object.keys(item).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const header = columns;
  const rows = items.map((item) => columns.map((c) => cellValue(item[c])));
  return [header, ...rows];
}

@Injectable()
export class ObenReportExcelService {
  /**
   * Convierte la respuesta real (JSON) de un stored procedure de Oben en un
   * .xlsx genérico: campos escalares del nivel superior como bloque de
   * info (etiqueta/valor), y cada campo que sea un arreglo como su propia
   * tabla debajo. No intenta replicar la plantilla exacta de Oben (celdas
   * combinadas, logo) — eso requiere la plantilla real como referencia
   * pixel a pixel, pendiente de construir aparte.
   */
  build(label: string, numberOrderSales: number, data: unknown): Buffer {
    const wb = XLSX.utils.book_new();
    const aoa: (string | number)[][] = [];

    aoa.push([label]);
    aoa.push(['Orden de Venta', numberOrderSales]);
    aoa.push([]);

    if (Array.isArray(data)) {
      aoa.push(...tableFromArray(data as Row[]));
    } else if (isPlainObject(data)) {
      const scalarEntries: [string, unknown][] = [];
      const arrayEntries: [string, Row[]][] = [];
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          arrayEntries.push([key, value as Row[]]);
        } else if (!isPlainObject(value)) {
          scalarEntries.push([key, value]);
        } else {
          scalarEntries.push([key, JSON.stringify(value)]);
        }
      }
      for (const [key, value] of scalarEntries) {
        aoa.push([key, cellValue(value)]);
      }
      for (const [key, items] of arrayEntries) {
        aoa.push([]);
        aoa.push([key]);
        aoa.push(...tableFromArray(items));
      }
    } else {
      aoa.push(['(sin datos)']);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
