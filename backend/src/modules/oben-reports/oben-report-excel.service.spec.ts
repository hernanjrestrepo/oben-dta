import ExcelJS from 'exceljs';
import { ObenReportExcelService } from './oben-report-excel.service';

describe('ObenReportExcelService', () => {
  const service = new ObenReportExcelService();

  async function readBack(buffer: Buffer): Promise<string[][]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    const rows: string[][] = [];
    ws.eachRow((row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        values.push(String(cell.value ?? ''));
      });
      rows.push(values);
    });
    return rows;
  }

  function flatten(rows: string[][]): string {
    return rows.map((r) => r.join('|')).join('\n');
  }

  it('genera un .xlsx válido y legible a partir de un objeto con campos escalares y un arreglo', async () => {
    const data = {
      Cliente: 'ETIQUETAS Y CAPSULAS DE COLOMBIA',
      OrdenVenta: '10794',
      Detalle: [
        { Material: 'AGLOMERADO', Cantidad: 52 },
        { Material: 'BUBBLE PACK', Cantidad: 10 },
      ],
    };

    const buffer = await service.build('Consumo de Material de Empaque', 10794, data);
    const rows = await readBack(buffer);
    const flat = flatten(rows);

    expect(rows[0][0]).toBe('Consumo de Material de Empaque');
    expect(flat).toContain('Orden de Venta|10794');
    expect(flat).toContain('Cliente|ETIQUETAS Y CAPSULAS DE COLOMBIA');
    expect(flat).toContain('Detalle');
    expect(flat).toContain('Material|Cantidad');
    expect(flat).toContain('AGLOMERADO|52');
    expect(flat).toContain('BUBBLE PACK|10');
    // el título no debe quedar como JSON crudo — cada campo en su propia celda
    expect(flat).not.toContain('{"Material"');
  });

  it('mantiene los datos anidados en sub-tablas propias, sin volcar JSON en una celda', async () => {
    const data = {
      Fecha: '2026-09-02',
      Cliente: 'ETIQUETAS Y CAPSULAS DE COLOMBIA ETICAP SA',
      OrdenVenta: '10794',
      Detalle1: [
        {
          Pelicula: 'ET012RT',
          Detalle2: [
            { Material: 'AGLOMERADO 765X800X18', Cantidad: 52, Observacion: '' },
          ],
        },
      ],
    };

    const buffer = await service.build('Consumo de Material de Empaque', 10794, data);
    const rows = await readBack(buffer);
    const flat = flatten(rows);

    expect(flat).toContain('ET012RT');
    expect(flat).toContain('Material|Cantidad|Observacion');
    expect(flat).toContain('AGLOMERADO 765X800X18|52');
    expect(flat).not.toMatch(/\{"Pelicula"/);
  });

  it('el título trae estilo real (fondo y negrita), no solo texto plano', async () => {
    const buffer = await service.build('Check Línea', 10794, [{ Linea: 1 }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const titleCell = wb.worksheets[0].getCell(1, 1);
    expect(titleCell.font?.bold).toBe(true);
    expect((titleCell.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe('FFF47735');
  });

  it('genera un .xlsx a partir de un arreglo plano (sin envoltura de objeto)', async () => {
    const data = [{ Linea: 1 }, { Linea: 2 }];
    const buffer = await service.build('Check Línea', 10794, data);
    const flat = flatten(await readBack(buffer));
    expect(flat).toContain('Linea');
    expect(flat).toContain('1');
    expect(flat).toContain('2');
  });

  it('no revienta con datos vacíos o null', async () => {
    await expect(service.build('X', 1, null)).resolves.toBeInstanceOf(Buffer);
    await expect(service.build('X', 1, [])).resolves.toBeInstanceOf(Buffer);
    await expect(service.build('X', 1, {})).resolves.toBeInstanceOf(Buffer);
  });
});
