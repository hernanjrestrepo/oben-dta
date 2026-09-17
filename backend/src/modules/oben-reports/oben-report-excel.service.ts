import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { OBEN_LOGO_BASE64 } from './oben-logo';

type Row = Record<string, unknown>;

/**
 * Estilo real de Oben (confirmado en vivo el 2026-09-10 inspeccionando los
 * .xls reales adjuntos al correo automático de Oben, convertidos con
 * LibreOffice para leer el formato exacto): Arial en negro sobre blanco, sin
 * ningún fondo de color ni banner — nada de naranja/gris de marca Paradixe.
 * Las etiquetas van en negrita, los valores en texto normal.
 */
const FONT_FAMILY = 'Arial';
const BLACK = 'FF000000';
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

/**
 * Logo real de Oben Holding Group en la esquina superior izquierda —
 * extraído del correo automático real de Oben (ver oben-logo.ts). Ocupa las
 * primeras 3 filas; el resto del encabezado empieza en la fila 4 para no
 * superponerse.
 */
function embedLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet): void {
  const imageId = wb.addImage({ base64: OBEN_LOGO_BASE64, extension: 'jpeg' });
  ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 100, height: 36 } });
}

/** Línea de texto centrada, negrita opcional — títulos y subtítulos reales de Oben. */
function writeCenteredLine(ws: ExcelJS.Worksheet, row: number, cols: number, text: string, opts: { bold?: boolean; size?: number } = {}): void {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: FONT_FAMILY, bold: opts.bold ?? false, size: opts.size ?? 10, color: { argb: BLACK } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

/** Título grande del reporte (ej. "Consumo de Material de Empaque") — como en la plantilla real. */
function writeReportTitle(ws: ExcelJS.Worksheet, row: number, cols: number, text: string): void {
  writeCenteredLine(ws, row, cols, text, { bold: true, size: 16 });
}

/**
 * Mensaje explícito cuando Oben no tiene datos de tabla para este reporte en
 * esta orden (ej. spConsumoMP_Paradixe sin `Detalle` — visto en vivo el
 * 2026-09-10 para la OV 10952: el material existe, pero no tiene consumo de
 * materia prima registrado). Antes esto caía al volcado genérico, que
 * repetía el encabezado (Fecha/Cliente/Orden) por segunda vez y no dejaba
 * ninguna tabla — un correo así se ve roto/vacío en vez de simplemente "no
 * aplica para esta orden".
 */
function writeNoDataMessage(ws: ExcelJS.Worksheet, row: number, cols: number): number {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = 'Oben no tiene datos de este reporte para esta orden.';
  cell.font = { name: FONT_FAMILY, italic: true, size: 11, color: { argb: 'FF6B7280' } };
  return row + 1;
}

/** Fila etiqueta/valor del bloque de encabezado (Cliente, Orden de Venta, etc). */
function writeInfoRow(ws: ExcelJS.Worksheet, row: number, label: string, value: unknown): void {
  const labelCell = ws.getCell(row, 1);
  labelCell.value = label;
  labelCell.font = { name: FONT_FAMILY, bold: true, color: { argb: BLACK } };
  const valueCell = ws.getCell(row, 2);
  valueCell.value = scalar(value);
  valueCell.font = { name: FONT_FAMILY, bold: false, color: { argb: BLACK } };
}

/**
 * Línea de subtítulo de la plantilla real de Oben (ej. "OBEN COLOMBIA
 * S.A.S." / "EXPORTACION DE PELICULA / FILM EXPORT") — texto plano en negro,
 * sin banner de color: la plantilla real de Oben no usa fondos de color en
 * absoluto, solo Arial negro sobre blanco (confirmado en vivo el 2026-09-09
 * inspeccionando los .xls reales adjuntos al correo automático de Oben).
 */
function writePlainLine(ws: ExcelJS.Worksheet, row: number, cols: number, text: string, bold = false): void {
  writeCenteredLine(ws, row, cols, text, { bold, size: bold ? 11 : 10 });
}

/**
 * Cuadrícula de 2 columnas etiqueta/valor bilingüe (ES/EN), replicando la
 * organización real de "Lista de Empaque (Unificada/Detallada)" de Oben:
 * Cliente/País en la primera fila, Código Material/Orden en la segunda,
 * Contenedor/Proforma en la tercera, Fecha/Orden de Compra en la cuarta —
 * confirmado en vivo el 2026-09-09 contra ListaEmpaqueUnificada.xls y
 * ListaEmpaqueDetallada.xls reales (correo automático OV 10931).
 */
function writeBilingualInfoGrid(
  ws: ExcelJS.Worksheet,
  startRow: number,
  rows: Array<[string, unknown, string, unknown]>,
): number {
  let row = startRow;
  for (const [leftLabel, leftValue, rightLabel, rightValue] of rows) {
    ws.mergeCells(row, 1, row, 2);
    const leftLabelCell = ws.getCell(row, 1);
    leftLabelCell.value = leftLabel;
    leftLabelCell.font = { name: FONT_FAMILY, bold: true, size: 9, color: { argb: BLACK } };
    const leftValueCell = ws.getCell(row, 3);
    leftValueCell.value = scalar(leftValue);
    leftValueCell.font = { name: FONT_FAMILY, bold: false, size: 10, color: { argb: BLACK } };

    if (rightLabel) {
      ws.mergeCells(row, 5, row, 6);
      const rightLabelCell = ws.getCell(row, 5);
      rightLabelCell.value = rightLabel;
      rightLabelCell.font = { name: FONT_FAMILY, bold: true, size: 9, color: { argb: BLACK } };
      const rightValueCell = ws.getCell(row, 7);
      rightValueCell.value = scalar(rightValue);
      rightValueCell.font = { name: FONT_FAMILY, bold: false, size: 10, color: { argb: BLACK } };
    }
    row += 1;
  }
  return row;
}

/** Encabezado de tabla: negrita, sin fondo — igual a la plantilla real de Oben. */
function writeTableHeader(ws: ExcelJS.Worksheet, row: number, columns: string[]): void {
  columns.forEach((col, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = col;
    cell.font = { name: FONT_FAMILY, bold: true, size: 10, color: { argb: BLACK } };
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
}

function writeTableRow(ws: ExcelJS.Worksheet, row: number, values: (string | number)[]): void {
  values.forEach((v, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = v;
    cell.font = { name: FONT_FAMILY, size: 10, color: { argb: BLACK } };
    cell.border = THIN_BORDER;
  });
}

function writeTotalsRow(ws: ExcelJS.Worksheet, row: number, values: (string | number)[]): void {
  writeTableRow(ws, row, values);
  ws.getRow(row).font = { name: FONT_FAMILY, bold: true, color: { argb: BLACK } };
}

/** Encabezado de sección (ej. "PELÍCULA: X", "PALLET: Y") — negrita, sin color de marca. */
function writeSectionHeader(ws: ExcelJS.Worksheet, row: number, text: string): void {
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: FONT_FAMILY, bold: true, size: 11, color: { argb: BLACK } };
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

export type ObenReportFormat =
  | 'packing_list'
  | 'consumo_me'
  | 'consumo_mp'
  | 'empaque_unificada'
  | 'empaque_detallada'
  | 'generic';

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
    embedLogo(wb, ws);

    // Filas 1-3 reservadas para el logo (ver embedLogo) — el resto del
    // encabezado empieza en la fila 4, igual que en los archivos reales.
    let row = 4;

    if (format === 'empaque_unificada' && isPlainObject(data)) {
      row = this.buildEmpaqueUnificada(ws, row, numberOrderSales, data);
    } else if (format === 'empaque_detallada' && isPlainObject(data)) {
      row = this.buildEmpaqueDetallada(ws, row, numberOrderSales, data);
    } else {
      writeReportTitle(ws, row, 8, label);
      row += 2;
      if (format === 'packing_list' && isPlainObject(data)) {
        row = this.buildPackingList(ws, row, numberOrderSales, data);
      } else if (format === 'consumo_me' && isPlainObject(data)) {
        row = this.buildConsumoME(ws, row, numberOrderSales, data);
      } else if (format === 'consumo_mp' && isPlainObject(data)) {
        row = this.buildConsumoMP(ws, row, numberOrderSales, data);
      } else {
        writeInfoRow(ws, row, 'Orden de Venta', numberOrderSales);
        row += 2;
        row = this.buildGeneric(ws, row, data);
      }
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
        writeSectionHeader(ws, row, key);
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
      return writeNoDataMessage(ws, row, 10);
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
    writeTotalsRow(ws, row, totalRowValues);
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
      return writeNoDataMessage(ws, row, 10);
    }

    for (const grupo of grupos) {
      writeSectionHeader(ws, row, `PELÍCULA: ${scalar(grupo.Pelicula)}`);
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
      writeTotalsRow(ws, row, ['TOTAL', Math.round(totalCantidad * 100) / 100, '']);
      row += 2;
    }
    return row;
  }

  /**
   * Replica "Consumo de Materia Prima" real de Oben (correo real OV 10931,
   * ConsumoMP.xls: Pelicula | Peso Pelicula | Material | Nombre Material |
   * Cantidad | Porcentaje) — una sola tabla plana, nombres de campo
   * confirmados en vivo el 2026-09-09 vía spConsumoMP_Paradixe.
   */
  private buildConsumoMP(
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

    const items = (data.Detalle as Row[] | undefined) ?? [];
    if (items.length === 0) {
      return writeNoDataMessage(ws, row, 10);
    }

    const columns: Array<[string, string]> = [
      ['Pelicula', 'Película'],
      ['PesoPelicula', 'Peso Película (kg)'],
      ['Material', 'Material'],
      ['NombreMaterial', 'Nombre Material'],
      ['Cantidad', 'Cantidad'],
      ['Porcentaje', 'Porcentaje (%)'],
    ];
    writeTableHeader(ws, row, columns.map(([, label]) => label));
    row += 1;
    let totalCantidad = 0;
    for (const item of items) {
      writeTableRow(ws, row, columns.map(([key]) => scalar(item[key])));
      row += 1;
      const c = Number(item.Cantidad);
      if (Number.isFinite(c)) totalCantidad += c;
    }
    const totalRow = columns.map(([key], i) => {
      if (i === 0) return 'TOTAL';
      return key === 'Cantidad' ? Math.round(totalCantidad * 100) / 100 : '';
    });
    writeTotalsRow(ws, row, totalRow);
    row += 1;
    return row;
  }

  /**
   * Replica "Lista de Empaque Unificada" real de Oben (correo real OV 10931,
   * ListaEmpaqueUnificada.xls): encabezado Cliente/País/Contenedor/Orden/
   * Proforma + totales, y una fila por paleta (no por rollo individual, a
   * diferencia de la Detallada) — nombres de campo confirmados en vivo el
   * 2026-09-09 vía spEmpaqueUnificada_Paradixe.
   */
  private buildEmpaqueUnificada(
    ws: ExcelJS.Worksheet,
    startRow: number,
    numberOrderSales: number,
    data: Record<string, unknown>,
  ): number {
    let row = startRow;
    writePlainLine(ws, row, 9, 'OBEN COLOMBIA S.A.S.', true);
    row += 1;
    writePlainLine(ws, row, 9, 'EXPORTACION DE PELICULA / FILM EXPORT');
    row += 1;
    writePlainLine(ws, row, 9, 'LISTA DE EMPAQUE (Unificada) / PACKING LIST (Unified)', true);
    row += 2;
    writeInfoRow(ws, row, 'Orden de Venta', numberOrderSales);
    row += 2;
    row = writeBilingualInfoGrid(ws, row, [
      ['Cliente / Client', data.Cliente, 'País / Country', data.Pais],
      ['Código Material / Material Code', data.CodigoMaterial, 'Orden / Order', numberOrderSales],
      ['Contenedor / Container', data.Contenedor, 'Proforma / Document', data.Proforma],
      ['Fecha / Date', data.Fecha, 'Orden Compra / PO Customer', data.OrdenCompra],
    ]);
    row += 1;
    for (const [key, label] of [
      ['TotalPallet', 'Total Pallets'],
      ['TotalBobinas', 'Total Bobinas'],
      ['TotalPesoNetoKg', 'Total Peso Neto (kg)'],
      ['TotalPesoBrutoKg', 'Total Peso Bruto (kg)'],
    ] as const) {
      if (data[key] !== undefined) {
        writeInfoRow(ws, row, label, data[key]);
        row += 1;
      }
    }
    row += 1;

    const items = (data.Detalle as Row[] | undefined) ?? [];
    if (items.length === 0) {
      return writeNoDataMessage(ws, row, 10);
    }

    const columns: Array<[string, string]> = [
      ['CodigoPallet', 'Código Pallet'],
      ['CodigoMaterial', 'Código Material'],
      ['Anchomm', 'Ancho (mm)'],
      ['Anchoin', 'Ancho (in)'],
      ['Bobinas', 'Bobinas'],
      ['PesoNetoKg', 'Peso Neto (kg)'],
      ['PesoNetoLb', 'Peso Neto (lb)'],
      ['PesoBrutoKg', 'Peso Bruto (kg)'],
      ['PesoBrutoLb', 'Peso Bruto (lb)'],
    ];
    writeTableHeader(ws, row, columns.map(([, label]) => label));
    row += 1;
    const totals: Record<string, number> = {};
    for (const item of items) {
      writeTableRow(ws, row, columns.map(([key]) => scalar(item[key])));
      row += 1;
      for (const key of ['Bobinas', 'PesoNetoKg', 'PesoBrutoKg']) {
        const v = Number(item[key]);
        if (Number.isFinite(v)) totals[key] = (totals[key] ?? 0) + v;
      }
    }
    const totalRow = columns.map(([key], i) => {
      if (i === 0) return 'TOTAL';
      return key in totals ? Math.round(totals[key] * 100) / 100 : '';
    });
    writeTotalsRow(ws, row, totalRow);
    row += 1;
    return row;
  }

  /**
   * Replica "Lista de Empaque Detallada" real de Oben (correo real OV 10931,
   * ListaEmpaqueDetallada.xls): una sección "PALLET: {código}" por cada
   * elemento de Detalle1, con su propia tabla de rollos individuales
   * (Detalle2) — nombres de campo confirmados en vivo el 2026-09-09 vía
   * spEmpaqueDetallada_Paradixe.
   */
  private buildEmpaqueDetallada(
    ws: ExcelJS.Worksheet,
    startRow: number,
    numberOrderSales: number,
    data: Record<string, unknown>,
  ): number {
    let row = startRow;
    writePlainLine(ws, row, 13, 'EXPORTACION DE PELICULA / FILM EXPORT');
    row += 1;
    writePlainLine(ws, row, 13, 'LISTA DE EMPAQUE (Detallada) / PACKING LIST (Detailed)', true);
    row += 2;
    writeInfoRow(ws, row, 'Orden de Venta', numberOrderSales);
    row += 2;
    row = writeBilingualInfoGrid(ws, row, [
      ['Cliente / Client', data.Cliente, 'País / Country', data.Pais],
      ['Código Material / Material Code', data.CodigoMaterial, 'Orden / Order', numberOrderSales],
      ['Contenedor / Container', data.Contenedor, 'Proforma / Document', data.Proforma],
      ['Fecha / Date', data.Fecha, 'Orden Compra / PO Customer', data.OrdenCompra],
    ]);
    row += 1;
    for (const [key, label] of [
      ['TotalPallet', 'Total Pallets'],
      ['TotalBobinas', 'Total Bobinas'],
      ['TotalPesoNetoKg', 'Total Peso Neto (kg)'],
      ['TotalPesoBrutoKg', 'Total Peso Bruto (kg)'],
    ] as const) {
      if (data[key] !== undefined) {
        writeInfoRow(ws, row, label, data[key]);
        row += 1;
      }
    }
    row += 1;

    const pallets = (data.Detalle1 as Row[] | undefined) ?? [];
    if (pallets.length === 0) {
      return writeNoDataMessage(ws, row, 10);
    }

    const columns: Array<[string, string]> = [
      ['CodigoInterno', 'Código Interno'],
      ['TipoPelicula', 'Tipo Película'],
      ['AnchoMm', 'Ancho (mm)'],
      ['AnchoIn', 'Ancho (in)'],
      ['PesoNetoKg', 'Peso Neto (kg)'],
      ['PesoNetoLb', 'Peso Neto (lb)'],
      ['PesoBrutoKg', 'Peso Bruto (kg)'],
      ['PesoBrutoLb', 'Peso Bruto (lb)'],
      ['Metraje', 'Metraje (m)'],
      ['MetrajeFt', 'Metraje (ft)'],
      ['Lote', 'Lote'],
      ['FabricacionMFG', 'Fecha Fabricación'],
      ['Empalmes', 'Empalmes'],
    ];
    for (const pallet of pallets) {
      const tipoPallet = String(pallet.TipoPallet ?? '').trim();
      writeSectionHeader(ws, row, `PALLET: ${scalar(pallet.Codigo)}${tipoPallet ? ` — ${tipoPallet}` : ''}`);
      row += 1;

      const rolls = (pallet.Detalle2 as Row[] | undefined) ?? [];
      writeTableHeader(ws, row, columns.map(([, label]) => label));
      row += 1;
      for (const roll of rolls) {
        writeTableRow(ws, row, columns.map(([key]) => scalar(roll[key])));
        row += 1;
      }
      row += 1;
    }
    return row;
  }

  /**
   * "Lista Especial" real de Oben — confirmado por José el 2026-09-10 (doc.
   * de APIs/SPs de Liquidación) que es spPackingListUSA_Paradixe, y por
   * Jorge Restrepo el mismo día ("esta lista es especial, debe tener 3
   * hojas") — replica exactamente el archivo real adjunto al correo
   * automático de Oben para la OV 10931 (ListaEspecial.xls, en realidad un
   * .xlsx): "Detailed Packing List" (una fila por rollo), "Summary Packing
   * List" (una fila por paleta) y "Width Wise Summary PL" (una fila por
   * ancho de bobina) — nombres de campo confirmados en vivo el 2026-09-10
   * contra spPackingListUSA_Paradixe real (OV 10727).
   */
  async buildListaEspecial(numberOrderSales: number, data: Record<string, unknown>): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const lines = (data.DetailedPackingList as Row[] | undefined) ?? [];

    const wsDetailed = wb.addWorksheet('Detailed Packing List', { pageSetup: { fitToPage: true, orientation: 'landscape' } });
    this.writeListaEspecialHeader(wb, wsDetailed, numberOrderSales, data, 'Detailed Packing List');
    this.writeListaEspecialDetailed(wsDetailed, lines);
    autoWidth(wsDetailed);

    const wsSummary = wb.addWorksheet('Summary Packing List', { pageSetup: { fitToPage: true, orientation: 'landscape' } });
    this.writeListaEspecialHeader(wb, wsSummary, numberOrderSales, data, 'Summary Packing List');
    this.writeListaEspecialSummary(wsSummary, lines);
    autoWidth(wsSummary);

    const wsWidth = wb.addWorksheet('Width Wise Summary PL', { pageSetup: { fitToPage: true, orientation: 'landscape' } });
    this.writeListaEspecialHeader(wb, wsWidth, numberOrderSales, data, 'Width Wise Summary PL');
    this.writeListaEspecialWidthWise(wsWidth, lines);
    autoWidth(wsWidth);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  private writeListaEspecialHeader(
    wb: ExcelJS.Workbook,
    ws: ExcelJS.Worksheet,
    numberOrderSales: number,
    data: Record<string, unknown>,
    title: string,
  ): void {
    embedLogo(wb, ws);
    writeReportTitle(ws, 4, 10, title);
    let row = 6;
    row = writeBilingualInfoGrid(ws, row, [
      ['Nombre / Name', data.Cliente, 'Almacen / Warehouse', data.Almacen],
      ['OC Cliente / PO Customer', data.OC_Cliente, 'Documento / Document', data.Documento],
      ['Contenedor / Container', data.Contenedor, 'Numero / Number', data.Numero],
      ['Fecha / Date', data.Fecha, 'Local / Plant', data.Local],
    ]);
    writeInfoRow(ws, row, 'Orden de Venta', numberOrderSales);
  }

  private writeListaEspecialDetailed(ws: ExcelJS.Worksheet, lines: Row[]): number {
    let row = 12;
    const columns: Array<[string, string]> = [
      ['PO', 'PO'],
      ['CodigoInternacional', 'Cod. Internacional / International Code'],
      ['Descripcion', 'Descripcion / Description'],
      ['CodigoItem', 'Código / Item'],
      ['Producto', 'Producto / Product'],
      ['Tratamiento', 'Trat. / Treat.'],
      ['NroUnico', 'Nro. Único / Number Unique'],
      ['CodigoBarraPallet', 'Cod Barra Pallet / Pallet BarCode'],
      ['Ancho', 'Ancho (mm)'],
      ['WidthIn', 'Width (in)'],
      ['ODmm', 'OD (mm)'],
      ['ODin', 'OD (in)'],
      ['LongMt', 'Long Mt'],
      ['LengthFt', 'Length Ft'],
      ['Lote', 'Lote / Lot'],
    ];
    if (lines.length === 0) return writeNoDataMessage(ws, row, 15);
    writeTableHeader(ws, row, columns.map(([, label]) => label));
    row += 1;
    for (const line of lines) {
      writeTableRow(ws, row, columns.map(([key]) => scalar(line[key])));
      row += 1;
    }
    return row;
  }

  /** Una fila por paleta (agrupado por CodigoBarraPallet) — los pesos de paleta ya vienen repetidos en cada rollo de esa paleta, no se vuelven a sumar. */
  private writeListaEspecialSummary(ws: ExcelJS.Worksheet, lines: Row[]): number {
    let row = 12;
    const columns: Array<[string, string]> = [
      ['PO', 'PO'],
      ['CodigoInternacional', 'Cod. Internacional / International Code'],
      ['Descripcion', 'Descripcion / Description'],
      ['CodigoItem', 'Código / Item'],
      ['NroUnico', 'Nro. Único / Number Unique'],
      ['CodigoBarraPallet', 'Cod Barra Pallet / Pallet BarCode'],
      ['Ancho', 'Ancho (mm)'],
      ['WidthIn', 'Width (in)'],
      ['PaletaPesoBrutoKg', 'Peso Bruto Kg / Gross Weight Kg'],
      ['PalletGrossWeightLb', 'Peso Bruto Lb / Gross Weight Lb'],
      ['PaletaPesoNetoKg', 'Peso Neto Kg / Net Weight Kg'],
      ['PalletNetWeightLb', 'Peso Neto Lb / Net Weight Lb'],
      ['Bobinas', 'Bobinas / Rolls'],
      ['Lote', 'Lote / Lot'],
    ];
    if (lines.length === 0) return writeNoDataMessage(ws, row, 14);

    const pallets = new Map<string, Row & { Bobinas: number }>();
    for (const line of lines) {
      const key = String(line.CodigoBarraPallet ?? '');
      const existing = pallets.get(key);
      if (existing) {
        existing.Bobinas += 1;
      } else {
        pallets.set(key, { ...line, Bobinas: 1 });
      }
    }

    writeTableHeader(ws, row, columns.map(([, label]) => label));
    row += 1;
    let totalBobinas = 0;
    let totalNetoKg = 0;
    let totalBrutoKg = 0;
    for (const pallet of pallets.values()) {
      writeTableRow(ws, row, columns.map(([key]) => scalar(pallet[key])));
      row += 1;
      totalBobinas += pallet.Bobinas;
      const neto = Number(pallet.PaletaPesoNetoKg);
      const bruto = Number(pallet.PaletaPesoBrutoKg);
      if (Number.isFinite(neto)) totalNetoKg += neto;
      if (Number.isFinite(bruto)) totalBrutoKg += bruto;
    }
    writeTotalsRow(
      ws,
      row,
      columns.map(([key], i) => {
        if (i === 0) return 'TOTAL';
        if (key === 'PaletaPesoBrutoKg') return Math.round(totalBrutoKg * 100) / 100;
        if (key === 'PaletaPesoNetoKg') return Math.round(totalNetoKg * 100) / 100;
        if (key === 'Bobinas') return totalBobinas;
        return '';
      }),
    );
    row += 1;
    writeInfoRow(ws, row, 'Total Pallets', pallets.size);
    return row + 1;
  }

  /**
   * Una fila por ancho de bobina distinto. Peso neto sumado por rollo (dato
   * real a nivel de rollo); peso bruto sumado por paleta DISTINTA que tenga
   * al menos un rollo de ese ancho (el dato real de peso bruto solo existe a
   * nivel de paleta, no de rollo — sumarlo por rollo duplicaría paletas con
   * varios rollos del mismo ancho).
   */
  private writeListaEspecialWidthWise(ws: ExcelJS.Worksheet, lines: Row[]): number {
    let row = 12;
    const columns: Array<[string, string]> = [
      ['PO', 'PO'],
      ['Descripcion', 'Descripcion / Description'],
      ['WidthIn', 'Width (in)'],
      ['PesoNetoKg', 'Peso Neto Kg / Net Weight Kg'],
      ['PesoNetoLb', 'Peso Neto Lb / Net Weight Lb'],
      ['PesoBrutoKg', 'Peso Bruto Kg / Gross Weight Kg'],
      ['PesoBrutoLb', 'Peso Bruto Lb / Gross Weight Lb'],
    ];
    if (lines.length === 0) return writeNoDataMessage(ws, row, 7);

    const widths = new Map<string, { po: unknown; descripcion: unknown; widthIn: unknown; netoKg: number; netoLb: number; pallets: Map<string, number> }>();
    const allPallets = new Set<string>();
    for (const line of lines) {
      const key = String(line.Ancho ?? '');
      const palletKey = String(line.CodigoBarraPallet ?? '');
      allPallets.add(palletKey);
      const entry = widths.get(key) ?? { po: line.PO, descripcion: line.Descripcion, widthIn: line.WidthIn, netoKg: 0, netoLb: 0, pallets: new Map() };
      entry.netoKg += Number(line.BobinaPesoNetoKg) || 0;
      entry.netoLb += Number(line.RollNetWeightLb) || 0;
      entry.pallets.set(palletKey, Number(line.PaletaPesoBrutoKg) || 0);
      widths.set(key, entry);
    }

    writeTableHeader(ws, row, columns.map(([, label]) => label));
    row += 1;
    let totalNetoKg = 0;
    let totalNetoLb = 0;
    let totalBrutoKg = 0;
    let totalBrutoLb = 0;
    for (const entry of widths.values()) {
      const brutoKg = Array.from(entry.pallets.values()).reduce((sum, v) => sum + v, 0);
      writeTableRow(ws, row, [
        scalar(entry.po),
        scalar(entry.descripcion),
        scalar(entry.widthIn),
        Math.round(entry.netoKg * 100) / 100,
        Math.round(entry.netoLb * 100) / 100,
        Math.round(brutoKg * 100) / 100,
        '',
      ]);
      row += 1;
      totalNetoKg += entry.netoKg;
      totalNetoLb += entry.netoLb;
      totalBrutoKg += brutoKg;
    }
    writeTotalsRow(ws, row, [
      'Totales',
      '',
      '',
      Math.round(totalNetoKg * 100) / 100,
      Math.round(totalNetoLb * 100) / 100,
      Math.round(totalBrutoKg * 100) / 100,
      Math.round(totalBrutoLb * 100) / 100,
    ]);
    row += 1;
    writeInfoRow(ws, row, 'Total Pallets', allPallets.size);
    return row + 1;
  }

  /**
   * "Hoja de Costos" — confirmada por José el 2026-09-10: se consulta
   * spChecLinea_Paradixe(@NumberOV) para obtener las líneas de la orden, y
   * por cada línea, spCostOrder_Paradixe(@NumberOV,@Linea) vía
   * APICostOrderParadixe. Se consolidan todas las líneas en un solo
   * documento, una sección por línea (mismo criterio que ConsumoME/Empaque
   * Detallada) — a falta de confirmación explícita de si debe ser un
   * documento por línea, se eligió consolidar para no fragmentar el correo
   * en N adjuntos por una orden con N líneas.
   */
  /**
   * Un documento POR LÍNEA (confirmado por José Guzmán el 2026-09-17,
   * respuesta a la pregunta 3 de Preguntas_y_Requerimientos_Liquidacion_Oben:
   * "Se debe generar un documento individual por cada línea") — antes se
   * consolidaban todas las líneas de la orden en un solo archivo, decisión
   * propia mientras no teníamos confirmación.
   */
  async buildHojaCostos(numberOrderSales: number, linea: number, data: Record<string, unknown>): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hoja de Costos', { pageSetup: { fitToPage: true, orientation: 'landscape' } });
    embedLogo(wb, ws);
    writeReportTitle(ws, 4, 10, 'Hoja de Costos');
    let row = 6;
    writeInfoRow(ws, row, 'Orden de Venta', numberOrderSales);
    row += 2;

    const columns: Array<[string, string]> = [
      ['ConceptoPrincipal', 'Concepto Principal'],
      ['ConceptoDetalle', 'Concepto Detalle'],
      ['Nacionalizada', 'Nacionalizada'],
      ['NombreReferencia', 'Nombre Referencia'],
      ['Cantidad', 'Cantidad'],
      ['CantidadTotal', 'Cantidad Total'],
      ['UMB', 'UMB'],
      ['CostosUMB', 'Costo UMB'],
      ['PorcDesperdicio', '% Desperdicio'],
      ['Desperdicio', 'Desperdicio'],
      ['CostoTotal', 'Costo Total'],
      ['BaseCIFIVA', 'Base CIF IVA'],
      ['TotalIVA', 'Total IVA'],
    ];

    writeSectionHeader(ws, row, `LÍNEA ${linea}`);
    row += 1;
    for (const [key, label] of [
      ['Fecha', 'Fecha'],
      ['Cliente', 'Cliente'],
      ['Producto', 'Producto'],
      ['Referencia', 'Referencia'],
      ['TRM', 'TRM'],
      ['SumaCostoTotal', 'Suma Costo Total'],
      ['SumaTotalIVA', 'Suma Total IVA'],
    ] as const) {
      if (data[key] !== undefined) {
        writeInfoRow(ws, row, label, data[key]);
        row += 1;
      }
    }
    row += 1;

    const detalle = (data.Detalle as Row[] | undefined) ?? [];
    if (detalle.length === 0) {
      writeNoDataMessage(ws, row, 13);
    } else {
      writeTableHeader(ws, row, columns.map(([, label]) => label));
      row += 1;
      for (const item of detalle) {
        writeTableRow(ws, row, columns.map(([key]) => scalar(item[key])));
        row += 1;
      }
    }

    autoWidth(ws);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
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
          nestedCell.font = { name: FONT_FAMILY, italic: true, size: 9, color: { argb: 'FF6B7280' } };
          row += 1;
          row = this.writeGenericTable(ws, row, nested as Row[]);
        }
      }
    }
    return row;
  }
}
