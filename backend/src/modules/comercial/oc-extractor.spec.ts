import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { aKilos, aMicras, aMilimetros, parseNumero, unidadEspesor, unidadLongitud, unidadPeso } from './unidades';
import { buscarEquivalencia, construirLinea, extraerConIa, extraerConReglas, textoDeAdjuntos, type EquivalenciaRef } from './oc-extractor';

const EQ: EquivalenciaRef[] = [
  { id: 'e1', clientCode: 'BOPP 3', obenCode: 'SC3' },
  { id: 'e2', clientCode: 'BOPP 345', obenCode: 'SC15TN' },
  { id: 'e3', clientCode: 'Poliéster 15 g', obenCode: 'ET12' },
];

describe('unidades (fórmulas fijas, reunión 1:07:05)', () => {
  it('números en formato colombiano y estadounidense', () => {
    expect(parseNumero('1.000')).toBe(1000);
    expect(parseNumero('2,500')).toBe(2500);
    expect(parseNumero('1.000,5')).toBe(1000.5);
    expect(parseNumero('1,000.5')).toBe(1000.5);
    expect(parseNumero('12,5')).toBe(12.5);
    expect(parseNumero('425')).toBe(425);
    expect(parseNumero('abc')).toBeNull();
  });

  it('peso: kg, libras y toneladas', () => {
    expect(unidadPeso('Libras')).toBe('lb');
    expect(unidadPeso('KGS')).toBe('kg');
    expect(aKilos(1000, 'kg')).toEqual({ kilos: 1000, nota: null });
    expect(aKilos(2204.62, 'lb').kilos).toBeCloseTo(1000, 1);
    expect(aKilos(1.5, 't').kilos).toBe(1500);
  });

  it('ancho: mm, cm, m y pulgadas', () => {
    expect(unidadLongitud('pulgadas')).toBe('in');
    expect(unidadLongitud('"')).toBe('in');
    expect(aMilimetros(17, 'in').mm).toBe(431.8);
    expect(aMilimetros(60, 'cm').mm).toBe(600);
    expect(aMilimetros(425, 'mm').nota).toBeNull();
  });

  it('espesor: micras y mils se convierten; el gramaje NO (queda la nota)', () => {
    expect(unidadEspesor('micras')).toBe('um');
    expect(unidadEspesor('µm')).toBe('um');
    expect(aMicras(1, 'mil').micras).toBe(25.4);
    const g = aMicras(15, 'gm2');
    expect(g.micras).toBeNull();
    expect(g.nota).toMatch(/no se convierte a micras con fórmula/);
  });
});

describe('equivalencias en el texto del cliente', () => {
  it('gana la coincidencia completa más larga ("BOPP 345" antes que "BOPP 3"), sin importar tildes', () => {
    expect(buscarEquivalencia('Item 1: bopp 345 transparente', EQ)?.obenCode).toBe('SC15TN');
    expect(buscarEquivalencia('BOPP 3 mate', EQ)?.obenCode).toBe('SC3');
    expect(buscarEquivalencia('POLIESTER 15 G ancho 400', EQ)?.obenCode).toBe('ET12');
    expect(buscarEquivalencia('BOPP 34', EQ)).toBeNull();
  });

  it('una línea sin equivalencia NUNCA recibe una referencia Oben adivinada', () => {
    const l = construirLinea(1, { textoCliente: 'PELICULA NUEVA 20', codigoCliente: 'PELICULA NUEVA 20', cantidad: 100, unidad: 'kg', ancho: 400, unidadAncho: 'mm' }, EQ);
    expect(l.codigoOben).toBeNull();
    expect(l.faltantes[0]).toMatch(/sin equivalencia para "PELICULA NUEVA 20"/);
  });

  it('un ancho sin unidad no se asume en mm: queda como faltante', () => {
    const l = construirLinea(1, { textoCliente: 'BOPP 345', cantidad: 100, unidad: 'kg', ancho: 425, unidadAncho: null }, EQ);
    expect(l.anchoMm).toBeNull();
    expect(l.faltantes).toContain('unidad del ancho (425)');
  });
});

describe('extracción por reglas', () => {
  it('lee número de OC, fecha, dirección y líneas (kg/lb, mm/pulgadas/cm, precio y moneda)', () => {
    const r = extraerConReglas(
      [
        'Purchase Order #PO-7788',
        'Delivery date: 2026-11-15',
        'Ship to: Warehouse 4, Miami FL',
        '1) BOPP 345 — 2,204.62 lbs — width 17" — price USD 3.10',
        '2) Poliéster 15 g, 500 kg, ancho 60 cm, $ 2,85',
        'Gracias',
      ].join('\n'),
      'PO-7788',
      EQ,
    );
    expect(r).toMatchObject({ numero: 'PO-7788', fechaRequerida: '2026-11-15', direccionEntrega: 'Warehouse 4, Miami FL', extraidoPor: 'reglas' });
    expect(r.lineas).toHaveLength(2);
    expect(r.lineas[0]).toMatchObject({ codigoOben: 'SC15TN', anchoMm: 431.8, precioUnitario: 3.1, moneda: 'USD', faltantes: [] });
    expect(r.lineas[0].kilos).toBeCloseTo(1000, 1);
    // "$" solo es ambiguo (pesos o dólares): la moneda no se adivina.
    expect(r.lineas[1]).toMatchObject({ codigoOben: 'ET12', kilos: 500, anchoMm: 600, precioUnitario: 2.85, moneda: null });
  });

  it('"Orden de compra urgente" no tiene número: queda null (no se toma "urgente")', () => {
    expect(extraerConReglas('Cambien la dirección de entrega.\n- BOPP 345, 5.000 kg, ancho 425 mm', 'Orden de compra urgente', EQ).numero).toBeNull();
    expect(extraerConReglas('Favor ingresar la orden de compra OC-SIM-0990', '', EQ).numero).toBe('OC-SIM-0990');
    expect(extraerConReglas('', 'PO 7789 | End customer: ACME', EQ).numero).toBe('7789');
  });

  it('"2 mil kg" son dos mil kilos (no 2 mils de espesor)', () => {
    const r = extraerConReglas('BOPP 345 2 mil kg ancho 425 mm', '', EQ);
    expect(r.lineas[0]).toMatchObject({ kilos: 2000, espesorMicras: null });
  });

  it('fecha día/mes ambigua no se adivina: queda nota para confirmarla', () => {
    const r = extraerConReglas('Fecha de entrega: 03/04/2026\nBOPP 345 100 kg 425 mm', '', EQ);
    expect(r.fechaRequerida).toBeNull();
    expect(r.notas.join(' ')).toMatch(/ambiguo/);
    expect(extraerConReglas('Fecha de entrega: 25/04/2026', '', EQ).fechaRequerida).toBe('2026-04-25');
  });

  it('cliente intermediario (ej. Oben US): el cliente final sale del asunto', () => {
    const r = extraerConReglas('BOPP 345 100 kg 425 mm', 'PO 5566 | End customer: ACME PACKAGING / Miami', EQ, { clienteFinalEnAsunto: true });
    expect(r.clienteFinal).toBe('ACME PACKAGING');
  });

  it('sin ninguna línea con cantidad: lo dice (no inventa líneas)', () => {
    const r = extraerConReglas('Hola, adjunto el pedido.', '', EQ);
    expect(r.lineas).toEqual([]);
    expect(r.notas[0]).toMatch(/No se encontró ninguna línea/);
  });
});

describe('texto de los adjuntos', () => {
  it('lee Excel y CSV; una imagen (pantallazo) queda como "no leído" con aviso', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Referencia', 'Cantidad', 'Unidad', 'Ancho'], ['BOPP 345', 1000, 'kg', '425 mm']]), 'OC');
    const xlsx = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const r = await textoDeAdjuntos([
      { filename: 'oc.xlsx', content: xlsx },
      { filename: 'oc.csv', content: Buffer.from('Ref;Kg\nBOPP 3;50 kg') },
      { filename: 'pantallazo.png', contentType: 'image/png', content: Buffer.from([0x89, 0x50]) },
    ]);
    expect(r.texto).toContain('BOPP 345 | 1000 | kg | 425 mm');
    expect(r.resumen.map((a) => a.leido)).toEqual([true, true, false]);
    expect(r.notas[0]).toMatch(/pantallazo\.png" es una imagen/);
    // Y de ahí sale la línea:
    expect(extraerConReglas(r.texto, '', EQ).lineas[0]).toMatchObject({ codigoOben: 'SC15TN', kilos: 1000, anchoMm: 425 });
  });

  it('lee un PDF con texto', async () => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
    doc.text('Orden de compra OC-991');
    doc.text('BOPP 345 1200 kg ancho 425 mm');
    doc.end();
    const r = await textoDeAdjuntos([{ filename: 'oc.pdf', contentType: 'application/pdf', content: await done }]);
    expect(r.resumen[0].leido).toBe(true);
    expect(r.texto).toMatch(/BOPP 345 1200 kg/);
  });
});

describe('extracción con IA (Ollama)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const cfg = { host: 'http://ollama:11434', model: 'llama3' };

  it('la IA solo lee la orden; la referencia Oben sale de la tabla de equivalencias', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          numero: 'OC-1',
          fechaRequerida: '2026-12-01',
          lineas: [
            { textoCliente: 'bopp 345 x 1 ton', codigoCliente: 'BOPP 345', cantidad: 1, unidad: 't', ancho: 425, unidadAncho: 'mm', codigoOben: 'INVENTADO' },
            { textoCliente: 'algo nuevo', codigoCliente: 'NUEVO', cantidad: 10, unidad: 'kg', ancho: 40, unidadAncho: 'cm' },
          ],
        }),
      }),
    }) as never;
    const r = await extraerConIa(cfg, { texto: 'orden', asunto: '', equivalencias: EQ, ejemplos: [{ entrada: 'x', salida: { lineas: [] } }] });
    expect(r.extraidoPor).toBe('ia');
    expect(r.lineas[0]).toMatchObject({ codigoOben: 'SC15TN', kilos: 1000, anchoMm: 425 });
    expect(r.lineas[1]).toMatchObject({ codigoOben: null, anchoMm: 400 });
    const prompt = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).prompt as string;
    expect(prompt).toContain('no inventes datos');
    expect(prompt).toContain('Ejemplo 1');
  });

  it('si la IA no devuelve JSON válido, falla (y el servicio vuelve a la lectura por reglas)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ response: 'no es json' }) }) as never;
    await expect(extraerConIa(cfg, { texto: '', asunto: '', equivalencias: [], ejemplos: [] })).rejects.toThrow(/JSON válido/);
  });
});
