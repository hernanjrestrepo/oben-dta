import ExcelJS from 'exceljs';

/** Nombres legibles de los campos de la proforma que entrega Oben (los demás salen tal cual); espejo de la pantalla. */
export const ETIQUETAS_PROFORMA: Record<string, string> = {
  Proforma: 'Proforma',
  NroProforma: 'Proforma',
  OrdenVenta: 'Orden de venta',
  OrdenCompra: 'Orden de compra del cliente',
  Cliente: 'Cliente',
  Direccion: 'Dirección',
  PuertoEmbarque: 'Puerto de embarque',
  PuertoArribo: 'Puerto de arribo',
  Incoterms: 'Incoterm',
  Incoterm: 'Incoterm',
  TerminoPago: 'Término de pago',
  Pais: 'País',
  Mercado: 'Mercado',
  TipoPelicula: 'Película',
  Precio: 'Precio/kg',
  KilosTotales: 'Kilos',
  Partida: 'Partida',
  DescripcionSKU: 'Descripción',
  TipoMaterial: 'Tipo de material',
  Linea: 'Línea',
  CodSed_LineFilm: 'Línea',
};

export interface ProformaParaExcel {
  numberPF: string;
  campos: Record<string, unknown>;
  detalle: Array<Record<string, unknown>>;
  reporte: Record<string, unknown> | null;
}

const NARANJA = 'FFF47735';
const GRIS = 'FFF2F2F2';
const etiqueta = (k: string) => ETIQUETAS_PROFORMA[k] ?? k;

/** Texto de una celda: listas y objetos anidados se aplanan; vacío = ''. Los números se dejan como número. */
export function celdaProforma(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? Object.values(x as Record<string, unknown>).join(' ') : String(x))).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).replace(/\r/g, '');
}

/**
 * Excel de la proforma tal como la tiene Oben (María, 28-oct: "que permita descargar para validar información"):
 * hoja "Proforma" con el encabezado (consignatario, dirección, condiciones…) y hoja "Detalle" con sus líneas.
 */
export async function proformaExcel(p: ProformaParaExcel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Oben Xmart';
  const ws = wb.addWorksheet('Proforma', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 34 }, { width: 90 }];
  ws.mergeCells('A1:B1');
  ws.getCell('A1').value = `Proforma ${p.numberPF} — datos en vivo de OBEN MAS`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: NARANJA } };
  const extra = p.reporte ? Object.entries(p.reporte).filter(([k]) => !(k in p.campos) && k !== 'OrdenesVenta') : [];
  let fila = 3;
  for (const [k, v] of [...Object.entries(p.campos), ...extra]) {
    const c = ws.getRow(fila);
    c.getCell(1).value = etiqueta(k);
    c.getCell(1).font = { bold: true };
    c.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
    c.getCell(2).value = celdaProforma(v);
    c.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    c.getCell(1).alignment = { vertical: 'top' };
    fila++;
  }

  const wd = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] });
  const columnas = [...new Set(p.detalle.flatMap((d) => Object.keys(d)))];
  wd.columns = columnas.map((c) => ({ header: etiqueta(c), key: c, width: Math.max(12, Math.min(40, etiqueta(c).length + 4)) }));
  wd.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wd.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NARANJA } };
  for (const d of p.detalle) wd.addRow(Object.fromEntries(columnas.map((c) => [c, celdaProforma(d[c])])));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
