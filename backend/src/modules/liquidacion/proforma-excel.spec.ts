import ExcelJS from 'exceljs';
import { celdaProforma, proformaExcel } from './proforma-excel';

describe('Excel de la proforma de Oben (María, 28-oct)', () => {
  it('hoja Proforma con el encabezado (etiquetas legibles, consignatario) y hoja Detalle con las líneas', async () => {
    const buf = await proformaExcel({
      numberPF: '11562',
      campos: { Cliente: 'CAPITAL TRADE LTDA', Direccion: 'Rua X 100\nSao Paulo', Incoterms: 'CFR', Consignatario: 'ACME BRASIL' },
      detalle: [
        { Linea: 1, DescripcionSKU: 'BOPP 20 micras', KilosTotales: 22929 },
        { Linea: 2, DescripcionSKU: 'BOPP 25 micras', KilosTotales: 100.5 },
      ],
      reporte: { NroProforma: '11562', Mercado: 'EXPORTACION', OrdenesVenta: [{ NroOrdenVenta: '11371' }] },
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const h = wb.getWorksheet('Proforma')!;
    const filas = new Map<string, unknown>();
    h.eachRow((r) => filas.set(String(r.getCell(1).value), r.getCell(2).value));
    expect(filas.get('Cliente')).toBe('CAPITAL TRADE LTDA');
    expect(filas.get('Incoterm')).toBe('CFR');
    expect(filas.get('Consignatario')).toBe('ACME BRASIL'); // campo sin etiqueta: sale tal cual
    expect(String(filas.get('Dirección'))).toContain('Sao Paulo');
    expect(filas.get('Mercado')).toBe('EXPORTACION'); // del reporte de proformas COMEX
    expect(filas.has('OrdenesVenta')).toBe(false);
    const d = wb.getWorksheet('Detalle')!;
    expect(d.getRow(1).values).toEqual([undefined, 'Línea', 'Descripción', 'Kilos']);
    expect(d.getRow(3).getCell(3).value).toBe(100.5);
  });

  it('celdaProforma aplana listas y objetos y deja vacío lo nulo', () => {
    expect(celdaProforma(null)).toBe('');
    expect(celdaProforma(true)).toBe('Sí');
    expect(celdaProforma([{ a: 1, b: 'x' }, 'y'])).toBe('1 x, y');
    expect(celdaProforma(12.5)).toBe(12.5);
  });
});
