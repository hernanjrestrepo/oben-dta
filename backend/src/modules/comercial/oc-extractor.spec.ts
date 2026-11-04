import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { aKilos, aMicras, aMilimetros, parseNumero, unidadEspesor, unidadLongitud, unidadPeso } from './unidades';
import { buscarEquivalencia, construirLinea, extraerConIa, extraerConReglas, inferirPelicula, sinLineasRepetidas, textoDeAdjuntos, type EquivalenciaRef } from './oc-extractor';

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
      { filename: 'pantallazo.png', contentType: 'image/png', content: Buffer.alloc(40_000, 1) },
    ]);
    expect(r.texto).toContain('BOPP 345 | 1000 | kg | 425 mm');
    expect(r.resumen.map((a) => a.leido)).toEqual([true, true, false]);
    expect(r.notas[0]).toMatch(/pantallazo\.png" es una imagen/);
    // Y de ahí sale la línea:
    expect(extraerConReglas(r.texto, '', EQ).lineas[0]).toMatchObject({ codigoOben: 'SC15TN', kilos: 1000, anchoMm: 425 });
  });

  it('3-nov: imágenes y PDF escaneados se leen con visión; las firmas y banners se ignoran sin ruido; el tope de lecturas protege el gasto', async () => {
    const leidas: string[] = [];
    const lector = async (a: { filename: string; content: Buffer }) => {
      leidas.push(a.filename);
      return a.filename.endsWith('.pdf') ? '1 | BOPP 20 | 2.500 kg | 1020 mm' : null;
    };
    const firma = Buffer.alloc(64_538, 2);
    const r = await textoDeAdjuntos(
      [
        { filename: 'image001.png', contentType: 'image/png', content: firma }, // misma firma con otro nombre (mismo tamaño)
        { filename: 'firmadigital-obengroup_ing_29.png', contentType: 'image/png', content: firma },
        { filename: '_banner-en-gif-para-firma-de-correo_.gif', contentType: 'image/gif', content: Buffer.alloc(298_343, 3) },
        { filename: 'icono.png', contentType: 'image/png', content: Buffer.alloc(900, 4) }, // demasiado pequeña para ser una orden
        { filename: 'OC 4992 OBEN COLOMBIA.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-1.4 escaneado sin texto') },
        { filename: 'pedido.png', contentType: 'image/jpeg', content: Buffer.alloc(150_000, 5) }, // pantallazo útil que el lector no logra leer
      ],
      lector,
    );
    expect(leidas).toEqual(['OC 4992 OBEN COLOMBIA.pdf', 'pedido.png']); // solo lo que puede ser la orden
    expect(r.texto).toContain('(leído con IA)');
    expect(r.texto).toContain('BOPP 20 | 2.500 kg | 1020 mm');
    expect(r.notas.join(' ')).toMatch(/"pedido\.png" es una imagen/); // la que no se pudo leer sí se avisa
    expect(r.notas.join(' ')).not.toMatch(/firmadigital|banner|image001|icono/i);
  });

  it('sin lector visual (o con tope alcanzado) el comportamiento anterior se mantiene: se avisa y queda para revisión', async () => {
    const r = await textoDeAdjuntos([{ filename: 'pedido.png', contentType: 'image/png', content: Buffer.alloc(80_000, 5) }]);
    expect(r.resumen[0].leido).toBe(false);
    expect(r.notas[0]).toMatch(/es una imagen/);
    const tope = await textoDeAdjuntos(
      Array.from({ length: 6 }, (_, i) => ({ filename: `p${i}.pdf`, contentType: 'application/pdf', content: Buffer.from('%PDF-1.4 x') })),
      async () => null,
    );
    expect(tope.notas.length).toBe(6);
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

describe('sinLineasRepetidas (el correo y el adjunto traen las mismas líneas)', () => {
  it('quita del adjunto lo que ya está igual en el cuerpo; lo distinto se queda', () => {
    const cuerpo = ['Hola', '- BOPP 15, 1.000 kg, ancho 425 mm', '- BOPP MATE 20, 500 kg, ancho 60 cm'].join(String.fromCharCode(10));
    const adjunto = ['ORDEN DE COMPRA', '- BOPP 15, 1.000 kg, ancho 425 mm', '   - bopp mate 20, 500 kg,  ancho 60 cm', '- CPP 25, 300 kg, ancho 500 mm'].join(String.fromCharCode(10));
    const r = sinLineasRepetidas(cuerpo, adjunto);
    expect(r.quitadas).toBe(2);
    expect(r.texto).toContain('CPP 25, 300 kg');
    expect(r.texto).not.toContain('BOPP 15');
  });

  it('dos líneas iguales DENTRO de la misma fuente no se tocan', () => {
    const r = sinLineasRepetidas('Hola', ['- BOPP 15, 1.000 kg, ancho 425 mm', '- BOPP 15, 1.000 kg, ancho 425 mm'].join(String.fromCharCode(10)));
    expect(r.quitadas).toBe(0);
  });
});

describe('extraerConReglas — OC en PDF (DORFAN, 3-nov)', () => {
  const texto = [
    'RV: OC 4990 - 4991 - 4992',
    'ORDEN DE COMPRA No.: 4992',
    '| Fecha despacho: 18 de Diciembre de 2026 |',
    '| 1 | BOPP SC 20 MICRAS X 90.5 CMS | 4,700.00 | Kg(s) | US$ 2.50 | 11,750 |',
  ].join('\n');
  it('lee ancho en CMS, el número del encabezado y la fecha en letras', () => {
    const r = extraerConReglas(texto, 'RV: OC 4990 - 4991 - 4992', []);
    expect(r.numero).toBe('4992');
    expect(r.fechaRequerida).toBe('2026-12-18');
    expect(r.lineas[0].anchoMm).toBe(905);
    expect(r.lineas[0].kilos).toBe(4700);
  });
});

describe('extraerConReglas — correo de Castañeda (4-nov): tabla en celdas, precio de encabezado, película inferida', () => {
  const texto = [
    'Hola Mercedes, favor montar el siguiente pedido a planta Barranquilla:',
    'Ciudad: Bogotá',
    'Bobina Jumbo',
    'U$D 2,50',
    'Contado contra factura',
    '1 sku 25 micras Sc',
    'Entrega 23 de noviembre',
    'SC 25 - 640',
    '7.500 KILOS',
    'SC 25 - 1000',
    '17.000 KILOS',
  ].join('\n');
  const hoy = new Date('2026-11-03T20:00:00Z');

  it('toma ancho, kilos, precio y moneda, y deduce la película SC---0025TN', () => {
    const r = extraerConReglas(texto, 'CASTAÑEDA HERNANDEZ VICTOR ALFONSO', [], { peliculasConocidas: ['SC---0020TN', 'SC---0025TN', 'ET---0012RT'], hoy });
    expect(r.lineas).toHaveLength(2);
    expect(r.lineas[0]).toMatchObject({ kilos: 7500, anchoMm: 640, precioUnitario: 2.5, moneda: 'USD', codigoOben: 'SC---0025TN', codigoCliente: 'SC 25' });
    expect(r.lineas[1]).toMatchObject({ kilos: 17000, anchoMm: 1000, precioUnitario: 2.5, moneda: 'USD', codigoOben: 'SC---0025TN' });
    expect(r.lineas[0].faltantes).toEqual([]);
    expect(r.fechaRequerida).toBe('2026-11-23');
  });

  it('si el catálogo trae dos películas posibles no adivina', () => {
    const r = extraerConReglas(texto, '', [], { peliculasConocidas: ['SC---0025TN', 'SC---0025TS'], hoy });
    expect(r.lineas[0].codigoOben).toBeNull();
    expect(r.lineas[0].faltantes.join(' ')).toMatch(/sin equivalencia/);
  });

  it('una equivalencia de la tabla manda sobre la inferencia', () => {
    const r = extraerConReglas(texto, '', [{ id: 'e1', clientCode: 'SC 25', obenCode: 'SC---0025TN' }], { peliculasConocidas: ['SC---0025TS'], hoy });
    expect(r.lineas[0]).toMatchObject({ codigoOben: 'SC---0025TN', equivalenciaId: 'e1' });
  });
});

describe('extraerConReglas — PDF de INTALPEL (4-nov): número y despacho', () => {
  const nl = String.fromCharCode(10);
  const texto = [
    'Adjunto envío orden de compra Nro. 93252 para su respectivo trámite',
    '--- OC93252-OBEN COLOMBIA S.A.S.pdf ---',
    '2026/10/09',
    'ORDEN DE COMPRA',
    '93252',
    'DESPACHO:',
    '2026/11/18',
  ].join(nl);

  it('el número sale de "Nro. 93252" y no del nombre del archivo adjunto', () => {
    expect(extraerConReglas(texto, 'Orden de compra Nro. 93252', []).numero).toBe('93252');
  });

  it('sin el "Nro." toma el número de la línea siguiente a ORDEN DE COMPRA', () => {
    const sin = texto.replace('orden de compra Nro. 93252', 'compra');
    expect(extraerConReglas(sin, '', []).numero).toBe('93252');
  });

  it('DESPACHO: 2026/11/18 es la fecha requerida', () => {
    expect(extraerConReglas(texto, '', []).fechaRequerida).toBe('2026-11-18');
  });
});

describe('inferirPelicula — SKU sin equivalencia cuando hay una sola opción', () => {
  const catalogo = ['SC---0017TN', 'SC---0020TN', 'SC---0030TN', 'ML---0015MN', 'ML---0015MS', 'ML---0020MN', 'ET---0012RT'];

  it('letras + espesor únicos → la película', () => {
    expect(inferirPelicula('BOPP-SC 17 MICRAS TRANSP.', catalogo)).toBe('SC---0017TN');
    expect(inferirPelicula('SC 30', catalogo)).toBe('SC---0030TN');
  });

  it('varias del mismo espesor: desempata "transparente" / "metalizado"; sin pista no adivina', () => {
    expect(inferirPelicula('BOPP-SC 25 MICRAS TRANSP.', ['SC---0025TN', 'SC---0025MN'])).toBe('SC---0025TN');
    expect(inferirPelicula('BOPP-SC 25 MICRAS METALIZADO', ['SC---0025TN', 'SC---0025MN'])).toBe('SC---0025MN');
    expect(inferirPelicula('BOPP-SC 25 MICRAS', ['SC---0025TN', 'SC---0025MN'])).toBeNull(); // sin pista: por hacer
    expect(inferirPelicula('BOPP-ML 15 MICRAS METALIZADO', catalogo)).toBeNull(); // dos metalizados (MN y MS): no hay certeza
  });

  it('si no existe esa película en el catálogo, no inventa', () => {
    expect(inferirPelicula('BOPP-SC 99 MICRAS', catalogo)).toBeNull();
  });
});

describe('extraerConIa — unidad dañada por el OCR (INTALPEL, 4-nov)', () => {
  it('"Kão(s)" sin unidad en la respuesta de la IA: si el documento habla de kilos, son kg', async () => {
    const json = JSON.stringify({
      numero: '93252', fechaRequerida: '2026-11-18', direccionEntrega: null, clienteFinal: null,
      lineas: [{ textoCliente: 'BOPP-SC 17 MICRAS TRANSP.', codigoCliente: 'BOPP-SC 17 MICRAS', cantidad: 1000, unidad: null, ancho: 92.5, unidadAncho: 'cm', espesor: null, unidadEspesor: null, precioUnitario: 2.6, moneda: 'USD' }],
    });
    const r = await extraerConIa({ host: '', model: 'x' }, { texto: '| 02720 | BOPP-SC 17 MICRAS | 92.50 | 1000.00 | Kão(s) | US$ | 2.60 |', asunto: '', equivalencias: [], ejemplos: [], peliculasConocidas: ['SC---0017TN'], llm: async () => json });
    expect(r.lineas[0]).toMatchObject({ kilos: 1000, anchoMm: 925, precioUnitario: 2.6, codigoOben: 'SC---0017TN' });
    expect(r.lineas[0].faltantes).toEqual([]);
  });
});

describe('construirLinea — la referencia de película decide la unidad', () => {
  const eqs = [{ id: 'e1', clientCode: 'BOPP-SC 17 MICRAS', obenCode: 'SC---0017TN' }];
  const base = { textoCliente: 'BOPP-SC 17 MICRAS TRANSP.', codigoCliente: 'BOPP-SC 17 MICRAS', cantidad: 1000, ancho: 92.5, unidadAncho: 'cm', espesor: null, unidadEspesor: null, precioUnitario: 2.6, moneda: 'USD' };

  it('unidad dañada por el OCR ("Kão(s)") con la película resuelta → kg', () => {
    const l = construirLinea(1, { ...base, unidad: 'Kão(s)' }, eqs);
    expect(l.kilos).toBe(1000);
    expect(l.faltantes).toEqual([]);
  });

  it('sin unidad y con película → kg; sin película sigue faltando; una unidad distinta (m) no se toca', () => {
    expect(construirLinea(1, { ...base, unidad: null }, eqs).kilos).toBe(1000);
    expect(construirLinea(1, { ...base, codigoCliente: 'DESCONOCIDO', textoCliente: 'DESCONOCIDO', unidad: null }, []).faltantes.join(' ')).toMatch(/cantidad en kg o lb/);
    expect(construirLinea(1, { ...base, unidad: 'm' }, eqs).kilos).toBeNull();
  });
});

describe('inferirPelicula — código compacto ET12TA (Mega Goglio, 4-nov)', () => {
  it('"PET ET12TA" con espesor 12 µm → ET---0012TA si está en el catálogo', () => {
    expect(inferirPelicula('PET ET12TA', ['ET---0012TA', 'ET---0012RT', 'ET---0023TA'])).toBe('ET---0012TA');
  });
  it('si el código compacto no está en el catálogo no inventa', () => {
    expect(inferirPelicula('PET ET12TA', ['ET---0012RT'])).toBeNull();
  });
});

describe('extraerConReglas — el contenedor no es un ancho (Mega Goglio, 4-nov)', () => {
  it('"1 FCL 40\\" com aprox. 23,5 tons" no genera un ancho de 1016 mm', () => {
    const r = extraerConReglas('Quantidade mínima de 1 FCL 40" com aprox. 23,5 tons.', 'PEDIDO', []);
    expect(r.lineas[0]?.anchoMm ?? null).toBeNull();
  });
});
