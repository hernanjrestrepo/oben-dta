import ExcelJS from 'exceljs';
import { MiaArchivosStore, generarArchivoMia, type MiaContenido } from './mia-archivos';

const CONTENIDO: MiaContenido = {
  titulo: 'Facturas de octubre',
  parrafos: ['Resumen de las facturas pedidas a Oben.'],
  tablas: [{ titulo: 'Facturas', columnas: ['PF', 'Estado', 'Valor'], filas: [['11547', 'revisar', 1234.5], ['11249', 'rechazada', null]] }],
};

describe('MIA — archivos PDF, Excel y Word (José, 7-oct)', () => {
  it('PDF: documento válido', async () => {
    const b = await generarArchivoMia('pdf', CONTENIDO);
    expect(b.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('Excel: una hoja de resumen y una por tabla, con los datos', async () => {
    const b = await generarArchivoMia('xlsx', CONTENIDO);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(b as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Facturas']);
    const hoja = wb.getWorksheet('Facturas')!;
    expect(hoja.getRow(1).values).toEqual([undefined, 'PF', 'Estado', 'Valor']);
    expect(hoja.getRow(2).getCell(3).value).toBe(1234.5);
  });

  it('Word: documento .docx válido (zip)', async () => {
    const b = await generarArchivoMia('docx', CONTENIDO);
    expect(b.subarray(0, 2).toString()).toBe('PK');
    expect(b.length).toBeGreaterThan(1000);
  });

  it('el archivo solo lo descarga quien lo pidió', () => {
    const store = new MiaArchivosStore();
    const id = store.guardar('u1', 'Reporte.pdf', 'application/pdf', Buffer.from('x'));
    expect(store.obtener(id, 'u1')?.nombre).toBe('Reporte.pdf');
    expect(store.obtener(id, 'u2')).toBeNull();
    expect(store.obtener('no-existe', 'u1')).toBeNull();
  });
});
