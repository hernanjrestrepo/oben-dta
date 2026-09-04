import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

type Row = Record<string, unknown>;

const OBEN_ORANGE = 'FFF47735';
const HEADER_GREY = 'FFF3F4F6';
const BORDER_GREY: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFD1D5DB' } };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: BORDER_GREY,
  left: BORDER_GREY,
  bottom: BORDER_GREY,
  right: BORDER_GREY,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function scalar(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return '';
}

/** Título de reporte: fila combinada, fondo naranja Oben, texto blanco en negrita. */
function writeTitle(ws: ExcelJS.Worksheet, row: number, cols: number, text: string): void {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OBEN_ORANGE } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(row).height = 24;
}

/** Fila etiqueta/valor del bloque de encabezado (Cliente, Orden de Venta, etc). */
function writeInfoRow(ws: ExcelJS.Worksheet, row: number, label: string, value: unknown): void {
  const labelCell = ws.getCell(row, 1);
  labelCell.value = label;
  labelCell.font = { bold: true, color: { argb: 'FF6B7280' } };
  const valueCell = ws.getCell(row, 2);
  valueCell.value = scalar(value);
  valueCell.font = { bold: true, color: { argb: 'FF111827' } };
}

/** Encabezado de tabla: fila en negrita con fondo gris y bordes. */
function writeTableHeader(ws: ExcelJS.Worksheet, row: number, columns: string[]): void {
  columns.forEach((col, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = col;
    cell.font = { bold: true, size: 10, color: { argb: 'FF374151' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_GREY } };
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

function writeTableRow(ws: ExcelJS.Worksheet, row: number, values: (string | number)[]): void {
  values.forEach((v, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = v;
    cell.font = { size: 10 };
    cell.border = THIN_BORDER;
  });
}

function autoWidth(ws: ExcelJS.Worksheet, minWidths: number[] = []): void {
  ws.columns.forEach((col, i) => {
    let max = minWidths[i] ?? 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 50);
  });
}

/** Columnas reales de spPackingListUSA_Paradixe (confirmadas en vivo el 2026-08-31), con etiqueta legible. */
const PACKING_LIST_COLUMNS: Array<[string, string]> = [
  ['Descripcion', 'Producto'],
  ['CodigoInternacional', 'Código Internacional'],
  ['CodigoItem', 'Código Ítem'],
  ['Tratamiento', 'Tratamiento'],
  ['Lote', 'Lote'],
  ['Ancho', 'Ancho (mm)'],
  ['WidthIn', 'Ancho (in)'],
  ['ODmm', 'OD (mm)'],
  ['ODin', 'OD (in)'],
  ['LongMt', 'Longitud (m)'],
  ['LengthFt', 'Longitud (ft)'],
  ['BobinaPesoNetoKg', 'Peso Neto Bobina (kg)'],
  ['RollNetWeightLb', 'Peso Neto Bobina (lb)'],
  ['PaletaPesoNetoKg', 'Peso Neto Paleta (kg)'],
  ['PalletNetWeightLb', 'Peso Neto Paleta (lb)'],
  ['PaletaPesoBrutoKg', 'Peso Bruto Paleta (kg)'],
  ['PalletGrossWeightLb', 'Peso Bruto Paleta (lb)'],
  ['CodigoBarraBobina', 'Código Barra Bobina'],
  ['CodigoBarraPallet', 'Código Barra Pallet'],
  ['CodigoInternoBobina', 'Código Interno Bobina'],
  ['NroUnico', 'No. Único'],
  ['FabricacionMFG', 'Fecha Fabricación'],
  ['Empalmes', 'Empalmes'],
];

export type ObenReportFormat = 'packing_list' | 'consumo_me' | 'generic';

@Injectable()
export class ObenReportExcelService {
  async build(
    label: string,
    numberOrderSales: number,
    data: unknown,
    format: ObenReportFormat = 'generic',
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reporte', { pageSetup: { fitToPage: true, orientation: 'landscape' } });

    let row = 1;
    writeTitle(ws, row, 8, label);
    row += 2;

    if (format === 'packing_list' && isPlainObject(data)) {
      row = this.buildPackingList(ws, row, numberOrderSales, data);
    } else if (format === 'consumo_me' && isPlainObject(data)) {
      row = this.buildConsumoME(ws, row, numberOrderSales, data);
    } else {
      writeInfoRow(ws, row, 'Orden de Venta', numberOrderSales);
      row += 2;
      row = this.buildGeneric(ws, row, data);
    }

    autoWidth(ws);
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  private buildGeneric(ws: ExcelJS.Worksheet, startRow: number, data: unknown): number {
    let row = startRow;
    if (Array.isArray(data)) {
      row = this.writeGenericTable(ws, row, data as Row[]);
    } else if (isPlainObject(data)) {
      const scalarEntries: [string, unknown][] = [];
      const arrayEntries: [string, Row[]][] = [];
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) arrayEntries.push([key, value as Row[]]);
        else if (!isPlainObject(value)) scalarEntries.push([key, value]);
      }
      for (const [key, value] of scalarEntries) {
        writeInfoRow(ws, row, key, value);
        row += 1;
      }
      row += 1;
      for (const [key, items] of arrayEntries) {
        const sectionCell = ws.getCell(row, 1);
        sectionCell.value = key;
        sectionCell.font = { bold: true, size: 11, color: { argb: OBEN_ORANGE } };
        row += 1;
        row = this.writeGenericTable(ws, row, items);
        row += 1;
      }
    } else {
      ws.getCell(row, 1).value = '(sin datos)';
    }
    return row;
  }

  /**
   * Replica la organización real de "Lista de Empaque (Detallada)" de Oben
   * (ver Business/ListaEmpaqueDetallada OV 10155.xls): bloque de info
   * (Cliente/Documento/Número/Fecha/Almacén) y tabla de rollos con columnas
   * y totales reales — usa exactamente los nombres de campo que devuelve
   * spPackingListUSA_Paradixe (confirmados en vivo, no adivinados).
   */
  private buildPackingList(
    ws: ExcelJS.Worksheet,
    startRow: number,
    numberOrderSales: number,
    data: Record<string, unknown>,
  ): number {
    let row = startRow;
    writeInfoRow(ws, row, 'Orden de Venta', numberOrderSales);
    row += 1;
    for (const [key, label] of [
      ['Cliente', 'Cliente'],
      ['Documento', 'Documento'],
      ['Numero', 'Número'],
      ['Fecha', 'Fecha'],
      ['Almacen', 'Almacén'],
    ] as const) {
      if (data[key] !== undefined) {
        writeInfoRow(ws, row, label, data[key]);
        row += 1;
      }
    }
    row += 1;

    const lines = (data.DetailedPackingList as Row[] | undefined) ?? [];
    const columns = PACKING_LIST_COLUMNS.filter(([key]) => lines.some((l) => key in l));
    if (columns.length === 0) {
      return this.buildGeneric(ws, row, data);
    }

    writeTableHeader(ws, row, columns.map(([, label]) => label));
    row += 1;
    const weightCols = ['BobinaPesoNetoKg', 'PaletaPesoNetoKg', 'PaletaPesoBrutoKg'];
    const totals: Record<string, number> = {};
    for (const line of lines) {
      writeTableRow(ws, row, columns.map(([key]) => scalar(line[key])));
      row += 1;
      for (const wKey of weightCols) {
        const v = Number(line[wKey]);
        if (Number.isFinite(v)) totals[wKey] = (totals[wKey] ?? 0) + v;
      }
    }
    const totalRowValues = columns.map(([key], i) => {
      if (i === 0) return 'TOTAL';
      return weightCols.includes(key) ? Math.round((totals[key] ?? 0) * 100) / 100 : '';
    });
    writeTableRow(ws, row, totalRowValues);
    ws.getRow(row).font = { bold: true };
    ws.getRow(row).eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_GREY } }));
    row += 1;
    return row;
  }

  /**
   * Replica "Consumo de Material de Empaque" real de Oben (ver
   * Business/ConsumoME OV 10155.xls): una sección "PELÍCULA: {código}" por
   * cada elemento de Detalle1, con su propia tabla Material/Cantidad/
   * Observación (Detalle2) — nombres de campo confirmados en vivo.
   */
  private buildConsumoME(
    ws: ExcelJS.Worksheet,
    startRow: number,
    numberOrderSales: number,
    data: Record<string, unknown>,
  ): number {
    let row = startRow;
    writeInfoRow(ws, row, 'Orden de Venta', numberOrderSales);
    row += 1;
    for (const [key, label] of [
      ['Fecha', 'Fecha'],
      ['Cliente', 'Cliente'],
      ['OrdenVenta', 'Orden Venta (Oben)'],
    ] as const) {
      if (data[key] !== undefined) {
        writeInfoRow(ws, row, label, data[key]);
        row += 1;
      }
    }
    row += 1;

    const grupos = (data.Detalle1 as Row[] | undefined) ?? [];
    if (grupos.length === 0) {
      return this.buildGeneric(ws, row, data);
    }

    for (const grupo of grupos) {
      const sectionCell = ws.getCell(row, 1);
      sectionCell.value = `PELÍCULA: ${scalar(grupo.Pelicula)}`;
      sectionCell.font = { bold: true, size: 11, color: { argb: OBEN_ORANGE } };
      row += 1;

      const items = (grupo.Detalle2 as Row[] | undefined) ?? [];
      writeTableHeader(ws, row, ['Material', 'Cantidad', 'Observación']);
      row += 1;
      let totalCantidad = 0;
      for (const item of items) {
        writeTableRow(ws, row, [scalar(item.Material), scalar(item.Cantidad), scalar(item.Observacion)]);
        row += 1;
        const c = Number(item.Cantidad);
        if (Number.isFinite(c)) totalCantidad += c;
      }
      writeTableRow(ws, row, ['TOTAL', Math.round(totalCantidad * 100) / 100, '']);
      ws.getRow(row).font = { bold: true };
      ws.getRow(row).eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_GREY } }));
      row += 2;
    }
    return row;
  }

  /**
   * Tabla genérica bien formateada (bordes, encabezado en negrita, sin
   * volcar JSON crudo en una celda): cada campo que sea un arreglo anidado
   * (ej. Detalle2 dentro de Detalle1) se escribe como su propia sub-tabla
   * indentada en vez de JSON.stringify — no se pierde información, y cada
   * dato queda en su propia celda, no mezclado con títulos.
   */
  private writeGenericTable(ws: ExcelJS.Worksheet, startRow: number, items: Row[]): number {
    let row = startRow;
    if (items.length === 0) return row;

    const scalarColumns = Array.from(
      items.reduce((set, item) => {
        for (const [k, v] of Object.entries(item)) {
          if (!Array.isArray(v)) set.add(k);
        }
        return set;
      }, new Set<string>()),
    );
    const nestedColumns = Array.from(
      items.reduce((set, item) => {
        for (const [k, v] of Object.entries(item)) {
          if (Array.isArray(v)) set.add(k);
        }
        return set;
      }, new Set<string>()),
    );

    writeTableHeader(ws, row, scalarColumns);
    row += 1;
    for (const item of items) {
      writeTableRow(ws, row, scalarColumns.map((c) => scalar(item[c])));
      row += 1;
      for (const nestedKey of nestedColumns) {
        const nested = item[nestedKey];
        if (Array.isArray(nested) && nested.length > 0) {
          const nestedCell = ws.getCell(row, 1);
          nestedCell.value = `  ↳ ${nestedKey}`;
          nestedCell.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
          row += 1;
          row = this.writeGenericTable(ws, row, nested as Row[]);
        }
      }
    }
    return row;
  }
}
