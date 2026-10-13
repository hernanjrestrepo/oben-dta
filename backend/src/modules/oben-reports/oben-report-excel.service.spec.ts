import ExcelJS from 'exceljs';
import { ObenReportExcelService, anchoPulgadasEntero } from './oben-report-excel.service';

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

  // Reescrito el 2026-09-29 contra el .xls REAL que Oben venía recibiendo
  // antes de este sistema (adjunto por Maria Escobar/Jorge Restrepo,
  // "LISTAS DE EMPAQUE CLIENTES EXPORTACIÓN // SOLEFILMES": las listas del
  // sistema nuevo "no salen de forma configurada y manejable... sobre todo
  // para el cliente Solefilmes que es exigente con su documentación") —
  // comparado celda por celda con openpyxl contra el archivo real, no contra
  // una captura de pantalla.
  describe('formato empaque_unificada', () => {
    it('encabezado bilingüe de 2 líneas, agrupado por Código de Material con SUBTOTAL por grupo y TOTAL general — igual al archivo real', async () => {
      const data = {
        Cliente: 'TRUPAL S.A.',
        Pais: 'PERU',
        CodigoMaterial: 'SCTN',
        Contenedor: 'CONTENEDOR ESTANDAR DE 40 PIES (1190)',
        Proforma: '10840',
        OrdenCompra: '400.420',
        Fecha: '2026-09-29',
        // Campos de resumen reales de la API — YA NO se muestran como bloque
        // suelto arriba de la tabla (el archivo real nunca lo hizo así); se
        // conservan aquí solo para confirmar que el código ya no los pinta.
        TotalPallet: 33,
        TotalBobinas: 52,
        TotalPesoNetoKg: 999,
        TotalPesoBrutoKg: 999,
        Detalle: [
          { CodigoPallet: 'P1', PesoNetoKg: 500, PesoNetoLb: 1102.31, PesoBrutoKg: 540, PesoBrutoLb: 1190.48, Bobinas: 2, Anchomm: 840, Anchoin: '33-1/16', CodigoMaterial: 'SC---0030TN0840S0760' },
          { CodigoPallet: 'P2', PesoNetoKg: 505, PesoNetoLb: 1113.44, PesoBrutoKg: 545, PesoBrutoLb: 1201.62, Bobinas: 2, Anchomm: 840, Anchoin: '33-1/16', CodigoMaterial: 'SC---0030TN0840S0760' },
          { CodigoPallet: 'P3', PesoNetoKg: 600, PesoNetoLb: 1322.77, PesoBrutoKg: 650, PesoBrutoLb: 1433.01, Bobinas: 2, Anchomm: 880, Anchoin: '34-5/8', CodigoMaterial: 'SC---0030TN0880S0760' },
        ],
      };
      const buffer = await service.build('Lista de Empaque Unificada', 11130, data, 'empaque_unificada');
      const flat = flatten(await readBack(buffer));

      expect(flat).toContain('OBEN COLOMBIA S.A.S.');
      expect(flat).toContain('EXPORTACION DE PELICULA / FILM EXPORT');
      expect(flat).toContain('LISTA DE EMPAQUE  (Unificada) / PACKING LIST  (Unified)');

      // el archivo real NUNCA mostró "Orden de Venta" suelto, ni el bloque
      // resumen "Total Pallets/Bobinas/..." arriba de la tabla
      expect(flat).not.toContain('Orden de Venta');
      expect(flat).not.toContain('Total Pallets');
      expect(flat).not.toContain('Total Bobinas');
      expect(flat).not.toContain('999');

      // grid bilingüe de 2 líneas real: Orden va emparejado con Código
      // Material (no con País), Proforma con Contenedor, Orden Compra con Fecha
      expect(flat).toContain('Cliente \nClient|Cliente \nClient|TRUPAL S.A.|País \nCountry|País \nCountry|PERU');
      expect(flat).toContain('Código Material  Material Code|Código Material  Material Code|SCTN|Orden \nOrder|Orden \nOrder|11130');
      expect(flat).toContain(
        'Contenedor  Container|Contenedor  Container|CONTENEDOR ESTANDAR DE 40 PIES (1190)|Proforma Document|Proforma Document|10840',
      );
      expect(flat).toContain('Fecha  \nDate|Fecha  \nDate|2026-09-29|Orden Compra\nPO Customer|Orden Compra\nPO Customer|400.420');

      // encabezados de tabla bilingües en el orden real: peso antes que
      // ancho, código de material al final (no justo después del pallet)
      expect(flat).toContain(
        'Código Pallet\nPallet Code|Peso Neto Kg\nNet Weight Kg|Peso Neto Lb\nNet Weight Lb|Peso Bruto Kg\nGross Weight Kg|Peso Bruto Lb\nGross Weight Lb|Bobinas\nRolls|Ancho (mm)\nWidth (mm)|Ancho (in)\nWidth (in)|Código material\nCode Material',
      );

      // SUBTOTAL al cerrar cada grupo de Código de Material (por ancho)
      expect(flat).toContain('SUBTOTAL|1005|2215.75|1085|2392.1|4');
      expect(flat).toContain('SUBTOTAL|600|1322.77|650|1433.01|2');

      // TOTAL general: fila de etiquetas y, debajo, 3 paletas + sumas de las 3 líneas
      expect(flat).toContain(
        'TOTAL\nPallets|Peso Neto Kg\nNet Weight Kg|Peso Neto Lb\nNet Weight Lb|Peso Bruto Kg\nGross Weight Kg|Peso Bruto Lb\nGross Weight Lb|Bobinas\nRolls',
      );
      expect(flat).toContain('3|1605|3538.52|1735|3825.11|6');
    });

    it('sin Detalle, muestra un mensaje claro en vez de un archivo roto', async () => {
      const data = { Cliente: 'TRUPAL S.A.', Detalle: [] };
      const buffer = await service.build('Lista de Empaque Unificada', 1, data, 'empaque_unificada');
      const flat = flatten(await readBack(buffer));

      expect(flat).toContain('Oben no tiene datos de este reporte para esta orden.');
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

  describe('Lista Especial (spPackingListUSA_Paradixe)', () => {
    // Valores reales del archivo completo de Oben (ListaEspecial de la FEXP3164, OC 1031/PO#657724).
    const rollo928 = {
      PO: '1031/PO#657724',
      CodigoInternacional: '2691428C53204152026914C0301359771',
      Descripcion: 'OPET PLAIN FILM ET12 TA X 928 MM Core 6 Diámetro 940',
      CodigoItem: 'ET---0012TA0928S0940',
      Producto: 'ET-12-TA',
      Tratamiento: 'TA',
      NroUnico: 359771,
      CodigoBarraPallet: '26914C0301359771',
      Ancho: 928,
      WidthIn: '36.00-1.00/2.00',
      ODmm: 934,
      ODin: 36.77,
      LongMt: 50598.74,
      LengthFt: 166014.47,
      Lote: '3261112',
      CodigoBarraBobina: '2691428C532041520',
      CodigoInternoBobina: '2691428C532041520',
      FabricacionMFG: '2026-09-14',
      BobinaPesoNetoKg: 804.35,
      RollNetWeightLb: 1773.27,
      PaletaPesoNetoKg: 804.35,
      PalletNetWeightLb: 1773.27,
      PaletaPesoBrutoKg: 894,
      PalletGrossWeightLb: 1970.91,
      Empalmes: 0,
    };
    const rollo1397 = {
      ...rollo928,
      CodigoInternacional: '2691427C53204146026914C0101359764',
      Descripcion: 'OPET PLAIN FILM ET12 TA X 1397 MM Core 6 Diámetro 940',
      CodigoItem: 'ET---0012TA1397S0940',
      NroUnico: 359764,
      CodigoBarraPallet: '26914C0101359764',
      Ancho: 1397,
      WidthIn: '55',
      CodigoBarraBobina: '2691427C532041460',
      CodigoInternoBobina: '2691427C532041460',
      BobinaPesoNetoKg: 1207.75,
      RollNetWeightLb: 2662.61,
      PaletaPesoNetoKg: 1207.75,
      PalletNetWeightLb: 2662.61,
      PaletaPesoBrutoKg: 1303,
      PalletGrossWeightLb: 2872.59,
    };
    const data = {
      Cliente: 'FORESTREE INC',
      OC_Cliente: '1031/PO#657724',
      Contenedor: 'ONEU6368790',
      Numero: 11238,
      DetailedPackingList: [rollo928, rollo1397],
    };

    /** Filas de una hoja con todas sus columnas (también las vacías), para ubicar cada dato por su encabezado. */
    async function hoja(buffer: Buffer, nombre: string): Promise<{ encabezados: string[]; filas: unknown[][] }> {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      const ws = wb.getWorksheet(nombre);
      if (!ws) throw new Error(`No existe la hoja ${nombre}`);
      const todas: unknown[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const valores: unknown[] = [];
        for (let c = 1; c <= ws.columnCount; c += 1) valores.push(row.getCell(c).value ?? '');
        todas.push(valores);
      });
      const inicio = todas.findIndex((f) => f[0] === 'PO');
      return { encabezados: todas[inicio].map(String).filter(Boolean), filas: todas.slice(inicio + 1) };
    }

    it('la hoja Detailed trae las 25 columnas del archivo completo de Oben: código de paleta y de bobina, y pesos en kg y lb por rollo', async () => {
      const { encabezados, filas } = await hoja(await service.buildListaEspecial(11081, data), 'Detailed Packing List');

      expect(encabezados).toEqual([
        'PO',
        'Cod. Internacional / International Code',
        'Descripcion / Description',
        'Código / Item',
        'Producto / Product',
        'Trat. / Treat.',
        'Nro. Único / Number Unique',
        'Cod Barra Pallet / Pallet BarCode',
        'Ancho (mm)',
        'Width (in)',
        'OD (mm)',
        'OD (in)',
        'Long Mt',
        'Length Ft',
        'Lote / Lot',
        'Cod Barra Bobina / Roll BarCode',
        'Cod. Interno / Internal Code',
        'Fabricación / MFG Date',
        'Bobina Peso Neto Kg / Roll Net Weight Kg',
        'Bobina Peso Neto Lb / Roll Net Weight Lb',
        'Paleta Peso Neto Kg / Pallet Net Weight Kg',
        'Paleta Peso Neto Lb / Pallet Net Weight Lb',
        'Paleta Peso Bruto Kg / Pallet Gross Weight Kg',
        'Paleta Peso Bruto Lb / Pallet Gross Weight Lb',
        'Empalmes / Splices',
      ]);
      const dato = (fila: unknown[], columna: string) => fila[encabezados.indexOf(columna)];
      expect(filas).toHaveLength(2);
      expect(dato(filas[0], 'Cod Barra Pallet / Pallet BarCode')).toBe('26914C0301359771');
      expect(dato(filas[0], 'Cod Barra Bobina / Roll BarCode')).toBe('2691428C532041520');
      expect(dato(filas[0], 'Fabricación / MFG Date')).toBe('2026-09-14');
      expect(dato(filas[0], 'Bobina Peso Neto Kg / Roll Net Weight Kg')).toBe(804.35);
      expect(dato(filas[0], 'Bobina Peso Neto Lb / Roll Net Weight Lb')).toBe(1773.27);
      expect(dato(filas[0], 'Paleta Peso Neto Kg / Pallet Net Weight Kg')).toBe(804.35);
      expect(dato(filas[0], 'Paleta Peso Neto Lb / Pallet Net Weight Lb')).toBe(1773.27);
      expect(dato(filas[0], 'Paleta Peso Bruto Kg / Pallet Gross Weight Kg')).toBe(894);
      expect(dato(filas[0], 'Paleta Peso Bruto Lb / Pallet Gross Weight Lb')).toBe(1970.91);
      expect(dato(filas[0], 'Empalmes / Splices')).toBe(0);
      expect(dato(filas[1], 'Paleta Peso Bruto Lb / Pallet Gross Weight Lb')).toBe(2872.59);
    });

    it('el ancho en pulgadas sale como número entero, aproximado al más cercano, en las tres hojas (928 mm → 37, 1397 mm → 55)', async () => {
      const buffer = await service.buildListaEspecial(11081, data);
      for (const nombre of ['Detailed Packing List', 'Summary Packing List', 'Width Wise Summary PL']) {
        const { encabezados, filas } = await hoja(buffer, nombre);
        const anchos = filas.slice(0, 2).map((f) => f[encabezados.indexOf('Width (in)')]);
        expect(anchos).toEqual([37, 55]);
      }
    });

    it('anchoPulgadasEntero: parte del ancho en mm; sin mm interpreta la fracción de Oben; sin dato legible no inventa', () => {
      expect(anchoPulgadasEntero(826, '32.00-1.00/2.00')).toBe(33);
      expect(anchoPulgadasEntero(915, '36.00')).toBe(36);
      expect(anchoPulgadasEntero(953, '37.00-1.00/2.00')).toBe(38);
      expect(anchoPulgadasEntero(1524, 60)).toBe(60);
      expect(anchoPulgadasEntero('928', null)).toBe(37);
      expect(anchoPulgadasEntero(undefined, '36.00-1.00/2.00')).toBe(37);
      expect(anchoPulgadasEntero(null, '32.00-1.00/4.00')).toBe(32);
      expect(anchoPulgadasEntero('', 55)).toBe(55);
      expect(anchoPulgadasEntero(null, '36.00')).toBe(36);
      expect(anchoPulgadasEntero(0, 'N/A')).toBe('N/A');
      expect(anchoPulgadasEntero(null, null)).toBe('');
    });

    it('Width Wise: el peso bruto en lb se suma por paleta distinta (antes salía vacío y el total en 0)', async () => {
      // Dos rollos en la MISMA paleta de 928 mm: el bruto de la paleta no se duplica.
      const segundo = { ...rollo928, NroUnico: 359772, CodigoBarraBobina: '2691428C532041521', BobinaPesoNetoKg: 100, RollNetWeightLb: 220.46 };
      const buffer = await service.buildListaEspecial(11081, { ...data, DetailedPackingList: [rollo928, segundo, rollo1397] });
      const { encabezados, filas } = await hoja(buffer, 'Width Wise Summary PL');
      const dato = (fila: unknown[], columna: string) => fila[encabezados.indexOf(columna)];

      expect(dato(filas[0], 'Peso Neto Kg / Net Weight Kg')).toBe(904.35);
      expect(dato(filas[0], 'Peso Bruto Kg / Gross Weight Kg')).toBe(894);
      expect(dato(filas[0], 'Peso Bruto Lb / Gross Weight Lb')).toBe(1970.91);
      expect(dato(filas[1], 'Peso Bruto Lb / Gross Weight Lb')).toBe(2872.59);
      const totales = filas[2];
      expect(totales[0]).toBe('Totales');
      expect(dato(totales, 'Peso Bruto Kg / Gross Weight Kg')).toBe(2197);
      expect(dato(totales, 'Peso Bruto Lb / Gross Weight Lb')).toBe(4843.5);
    });
  });
});
