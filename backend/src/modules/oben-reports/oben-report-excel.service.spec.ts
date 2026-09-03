import * as XLSX from 'xlsx';
import { ObenReportExcelService } from './oben-report-excel.service';

describe('ObenReportExcelService', () => {
  const service = new ObenReportExcelService();

  function readBack(buffer: Buffer): string[][] {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];
  }

  it('genera un .xlsx válido y legible a partir de un objeto con campos escalares y un arreglo', () => {
    const data = {
      Cliente: 'ETIQUETAS Y CAPSULAS DE COLOMBIA',
      OrdenVenta: '10794',
      Detalle: [
        { Material: 'AGLOMERADO', Cantidad: 52 },
        { Material: 'BUBBLE PACK', Cantidad: 10 },
      ],
    };

    const buffer = service.build('Consumo de Material de Empaque', 10794, data);
    const rows = readBack(buffer);

    expect(rows[0][0]).toBe('Consumo de Material de Empaque');
    expect(rows[1]).toEqual(['Orden de Venta', 10794]);
    const flat = rows.map((r) => r.join('|')).join('\n');
    expect(flat).toContain('Cliente|ETIQUETAS Y CAPSULAS DE COLOMBIA');
    expect(flat).toContain('Material|Cantidad');
    expect(flat).toContain('AGLOMERADO|52');
  });

  it('genera un .xlsx a partir de un arreglo plano (sin envoltura de objeto)', () => {
    const data = [{ Linea: 1 }, { Linea: 2 }];
    const buffer = service.build('Check Línea', 10794, data);
    const rows = readBack(buffer);
    const flat = rows.map((r) => r.join('|')).join('\n');
    expect(flat).toContain('Linea');
    expect(flat).toContain('1');
    expect(flat).toContain('2');
  });

  it('no revienta con datos vacíos o null', () => {
    expect(() => service.build('X', 1, null)).not.toThrow();
    expect(() => service.build('X', 1, [])).not.toThrow();
    expect(() => service.build('X', 1, {})).not.toThrow();
  });
});
