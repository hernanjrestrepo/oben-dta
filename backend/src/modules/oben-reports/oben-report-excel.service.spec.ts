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

  it('el título trae el estilo real de Oben: Arial negrita centrado, sin banner de color de marca Paradixe', async () => {
    const buffer = await service.build('Check Línea', 10794, [{ Linea: 1 }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    // filas 1-3 quedan reservadas para el logo real de Oben — el título va en la fila 4
    const titleCell = ws.getCell(4, 1);
    expect(titleCell.value).toBe('Check Línea');
    expect(titleCell.font?.bold).toBe(true);
    expect(titleCell.font?.name).toBe('Arial');
    expect(titleCell.alignment?.horizontal).toBe('center');
    expect((titleCell.fill as ExcelJS.FillPattern)?.pattern).toBe('none');
    // el logo real (extraído del correo automático de Oben) debe estar embebido
    expect(ws.getImages().length).toBeGreaterThan(0);
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

  // Campos confirmados en vivo el 2026-09-09 contra la respuesta real de
  // spConsumoMP_Paradixe / spEmpaqueUnificada_Paradixe / spEmpaqueDetallada_Paradixe
  // para la OV 10931 (TRUPAL S.A.), y cruzados contra ConsumoMP.xls /
  // ListaEmpaqueUnificada.xls / ListaEmpaqueDetallada.xls reales de Oben.
  describe('formato consumo_mp', () => {
    it('arma una tabla plana con los nombres de columna reales', async () => {
      const data = {
        Fecha: '2026-09-09',
        Cliente: 'TRUPAL S.A.',
        OrdenVenta: '10931',
        Detalle: [
          { Pelicula: 'TES040NN', PesoPelicula: 24507.68, Material: 'CPT-3915', NombreMaterial: 'COPO. PET', Cantidad: 17845.9, Porcentaje: 72.82 },
        ],
      };
      const buffer = await service.build('Consumo de Materia Prima', 10931, data, 'consumo_mp');
      const flat = flatten(await readBack(buffer));

      expect(flat).toContain('Cliente|TRUPAL S.A.');
      expect(flat).toContain('Película|Peso Película (kg)|Material|Nombre Material|Cantidad|Porcentaje (%)');
      expect(flat).toContain('TES040NN|24507.68|CPT-3915|COPO. PET|17845.9|72.82');
      expect(flat).toContain('TOTAL||||17845.9|');
    });

    it('sin Detalle (encontrado en vivo con la OV 10952), muestra un mensaje claro en vez de duplicar el encabezado', async () => {
      const data = { Fecha: '2026-09-10', Cliente: 'OBEN DISTRIBUIDORA COLOMBIA LTDA', OrdenVenta: '10952' };
      const buffer = await service.build('Consumo de Materia Prima', 10952, data, 'consumo_mp');
      const flat = flatten(await readBack(buffer));

      expect(flat).toContain('Oben no tiene datos de este reporte para esta orden.');
      // el encabezado (Cliente) debe aparecer una sola vez, no duplicado por un volcado genérico debajo
      const clienteOccurrences = (flat.match(/Cliente\|OBEN DISTRIBUIDORA COLOMBIA LTDA/g) ?? []).length;
      expect(clienteOccurrences).toBe(1);
    });
  });

  describe('formato empaque_unificada', () => {
    it('arma encabezado con totales y una fila por paleta', async () => {
      const data = {
        Cliente: 'TRUPAL S.A.',
        Pais: 'PERU',
        Contenedor: 'CONTENEDOR ESTANDAR DE 40 PIES (1190)',
        Proforma: '10840',
        TotalPallet: 33,
        TotalBobinas: 52,
        Detalle: [
          { CodigoPallet: '26821C0101356200', PesoNetoKg: 491.09, PesoBrutoKg: 527.4, Bobinas: 1, Anchomm: 873, Anchoin: '34-5/16' },
        ],
      };
      const buffer = await service.build('Lista de Empaque Unificada', 10931, data, 'empaque_unificada');
      const flat = flatten(await readBack(buffer));

      expect(flat).toContain('OBEN COLOMBIA S.A.S.');
      expect(flat).toContain('EXPORTACION DE PELICULA / FILM EXPORT');
      expect(flat).toContain('LISTA DE EMPAQUE (Unificada) / PACKING LIST (Unified)');
      expect(flat).toContain('Cliente / Client|Cliente / Client|TRUPAL S.A.|País / Country|País / Country|PERU');
      expect(flat).toContain('Total Pallets|33');
      expect(flat).toContain('Código Pallet|Código Material');
      expect(flat).toContain('26821C0101356200');
    });
  });

  describe('formato empaque_detallada', () => {
    it('arma una sección PALLET por cada elemento de Detalle1, con su tabla de rollos (Detalle2)', async () => {
      const data = {
        Cliente: 'TRUPAL S.A.',
        Detalle1: [
          {
            TipoPallet: 'Pallet 1 Bobina Horizontal 1 Piso  ',
            Codigo: '26821C0101356200',
            Detalle2: [
              { CodigoInterno: '2672838C651901840', TipoPelicula: 'TES--0040NN0873S0760', AnchoMm: 873, Lote: '1026064' },
            ],
          },
        ],
      };
      const buffer = await service.build('Lista de Empaque Detallada', 10931, data, 'empaque_detallada');
      const flat = flatten(await readBack(buffer));

      expect(flat).toContain('EXPORTACION DE PELICULA / FILM EXPORT');
      expect(flat).toContain('LISTA DE EMPAQUE (Detallada) / PACKING LIST (Detailed)');
      expect(flat).toContain('Cliente / Client|Cliente / Client|TRUPAL S.A.');
      expect(flat).toContain('PALLET: 26821C0101356200 — Pallet 1 Bobina Horizontal 1 Piso');
      expect(flat).toContain('Código Interno|Tipo Película');
      expect(flat).toContain('2672838C651901840');
      expect(flat).toContain('1026064');
    });
  });
});
