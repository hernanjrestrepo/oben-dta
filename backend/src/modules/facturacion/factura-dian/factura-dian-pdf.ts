import PDFDocument from 'pdfkit';
import * as bwipjs from 'bwip-js';
import { EMISOR_OBEN, TEXTO_LEGAL_NACIONAL } from './emisor';
import { LOGO_FACTURA_PNG_BASE64 } from './logo-factura';
import type { FacturaDian, FacturaDianLinea } from './factura-dian.types';

/**
 * Representación gráfica de la factura electrónica de Oben, idéntica a la que
 * genera Facture (FastReport) para la FV (nacional) y la FEXP (exportación):
 * mismas posiciones, líneas, grises, fuentes y cortes de página. Todas las
 * coordenadas salen de medir los PDF reales FV11363 y FEXP3190 (puntos PDF,
 * carta 612×792; "y0" = borde superior del texto como lo mide PyMuPDF).
 * Helvetica tiene las mismas métricas de ancho que la Arial del original.
 */

type Doc = PDFKit.PDFDocument;
interface Run {
  t: string;
  b?: boolean;
}
interface Seg {
  t: string;
  b: boolean;
  w: number;
}
interface Linea {
  segs: Seg[];
  w: number;
}
type Alin = 'left' | 'center' | 'right';

/** y0 del original → y de pdfkit (Arial: línea base a 0.776·s del borde superior; Helvetica en pdfkit: 0.718·s). */
const AJUSTE_Y = 0.058;
/** Interlineado de FastReport: 1.147 × tamaño de letra (8.6 pt a 7.5 pt). */
const interlinea = (s: number) => s * 1.147;
const GRIS_TITULO = '#C0C0C0';
const GRIS_CELDA = '#D3D3D3';
const LINEA = 0.75;
const MARCO = 0.56;
const QR_LADO = 63.87;

/** Columnas de la tabla de ítems (iguales en FV y FEXP). */
const COL = { item: 28.4, codigo: 62.4, desc: 116.2, cant: 256.0, um: 315.5, unit: 351.0, ivaPct: 421.8, ivaVal: 453.0, total: 518.2, fin: 583.4 };
/** Columnas del recuadro del cliente. */
const CC = [28.4, 174.8, 323.6, 422.8, 515.0, 583.0];

interface Plantilla {
  s: number;
  padX: number;
  padTop: number;
  /** Relleno inferior de una fila del recuadro del cliente según cuántas líneas tiene (medido en el original). */
  padBot: (lineas: number) => number;
  /** Alto mínimo de fila del recuadro del cliente (FastReport: 0.3 cm en la FV). */
  filaMin: number;
  logo: [number, number, number, number];
  empresaX: number;
  regimenX: number;
  filasEncabezado: number[];
  anchoRegimen: number;
  qr: [number, number];
  tituloCaja: [number, number, number, number];
  tituloY: number[];
  titulo: (numero: string) => string[];
  clienteY: number;
  valoresCentrados: boolean;
  etiquetaDireccion2: string;
  filaItemsMin: number;
  itemsPadTop: number;
  itemsPadBot: number;
}

const NACIONAL: Plantilla = {
  s: 5,
  padX: 2.2,
  padTop: 1.3,
  padBot: () => 0.93,
  filaMin: 8.5,
  logo: [29.5, 26.8, 85.0, 42.6],
  empresaX: 120.1,
  regimenX: 294.0,
  filasEncabezado: [29.7, 38.2, 46.7, 55.1, 63.6, 72.0],
  anchoRegimen: 210,
  qr: [526.5, 51.3],
  tituloCaja: [264.5, 91.8, 519.6, 113.0],
  tituloY: [93.4, 101.5],
  titulo: (n) => ['FACTURA ELECTRÓNICA DE VENTA / ELECTRONIC SALES INVOICE  No', n],
  clienteY: 118.7,
  valoresCentrados: true,
  etiquetaDireccion2: 'DIRECCION / ADDRESS:',
  filaItemsMin: 8.45,
  itemsPadTop: 1.4,
  itemsPadBot: 1.3,
};

const EXPORTACION: Plantilla = {
  s: 7.5,
  padX: 2.6,
  padTop: 1.7,
  padBot: (n) => (n <= 2 ? 1.5 : 0.7),
  filaMin: 0,
  logo: [27.3, 26.9, 87.3, 49.6],
  empresaX: 119.4,
  regimenX: 293.3,
  filasEncabezado: [30.1, 41.6, 53.2, 64.8, 76.3, 87.9],
  anchoRegimen: 210,
  qr: [523.1, 72.5],
  tituloCaja: [267.5, 113.4, 515.5, 132.6],
  tituloY: [115.1, 123.1],
  titulo: (n) => ['FACTURA  ELECTRÓNICA DE VENTA / ELECTRONIC SALES INVOICE', `No ${n}`],
  clienteY: 139.9,
  valoresCentrados: false,
  etiquetaDireccion2: 'DIRECCION / ADDRESS :',
  filaItemsMin: 8.45,
  itemsPadTop: 1.7,
  itemsPadBot: 1.55,
};

/** Límite inferior del contenido en exportación (FastReport: margen inferior de 1.5 cm). */
const LIMITE_EXP = 749.5;
/** Ancho de las etiquetas de totales en exportación ("I.V.A. 0.00% USD /" | "TAXES" se parte; "NETO A PAGAR/ TOTAL" no). */
const ETIQUETA_TOTALES_EXP = 89;
/** Alto del pie flotante de exportación (recuadro de pago + representación + CUFE + paginación). */
const PIE_EXP = 118;

// ───────────────────────── formatos ─────────────────────────

const enUS = (n: number, dec: number) => n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
/** Cantidad como la imprime Facture: 2.433,12 (punto de miles, coma decimal). */
const cantidadTxt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctTxt = (n: number) => n.toFixed(2);

// ───────────────────────── texto ─────────────────────────

function fuente(doc: Doc, b: boolean, s: number): Doc {
  return doc.font(b ? 'Helvetica-Bold' : 'Helvetica').fontSize(s);
}

function ancho(doc: Doc, t: string, b: boolean, s: number): number {
  return fuente(doc, b, s).widthOfString(t);
}

/**
 * Corta texto con negrillas mezcladas en líneas de `width` (como FastReport:
 * por espacios y después de guiones; una palabra más ancha que la celda se
 * parte por caracteres). "\n" fuerza salto.
 */
function envolver(doc: Doc, runs: Run[], width: number, s: number): Linea[] {
  // GDI+ corta un poco antes que el ancho geométrico de la celda (medido en FV11363/FEXP3190: ~0.15·tamaño).
  const util = width - 0.15 * s;
  const lineas: Linea[] = [];
  let cur: Seg[] = [];
  let w = 0;
  let envuelta = false;
  const agregar = (t: string, b: boolean, tw: number) => {
    const last = cur[cur.length - 1];
    if (last && last.b === b) {
      last.t += t;
      last.w += tw;
    } else cur.push({ t, b, w: tw });
    w += tw;
  };
  const cerrar = (porEnvolver: boolean) => {
    while (cur.length) {
      const last = cur[cur.length - 1];
      const t = last.t.replace(/\s+$/, '');
      if (t === last.t) break;
      if (t) {
        last.t = t;
        last.w = ancho(doc, t, last.b, s);
        break;
      }
      cur.pop();
    }
    lineas.push({ segs: cur, w: cur.reduce((a, x) => a + x.w, 0) });
    cur = [];
    w = 0;
    envuelta = porEnvolver;
  };
  const porCaracteres = (pieza: string, b: boolean) => {
    for (const ch of pieza) {
      const cw = ancho(doc, ch, b, s);
      if (w + cw > util && cur.some((x) => x.t.trim())) cerrar(true);
      agregar(ch, b, cw);
    }
  };
  runs.forEach((run) => {
    const b = !!run.b;
    run.t.split('\n').forEach((parrafo, i) => {
      if (i > 0) cerrar(false);
      for (const token of parrafo.match(/\s+|[^\s]+/g) ?? []) {
        if (/^\s+$/.test(token)) {
          if (!cur.length && envuelta) continue;
          agregar(token, b, ancho(doc, token, b, s));
          continue;
        }
        // FastReport (GDI+) solo corta tras un guion si sigue un número ("2028-02-|06", "SC---|0030…"), nunca en "JOSE-SANTA".
        for (const pieza of token.split(/(?<=-)(?=\d)/)) {
          const pw = ancho(doc, pieza, b, s);
          if (w + pw <= util) agregar(pieza, b, pw);
          else if (cur.some((x) => x.t.trim())) {
            cerrar(true);
            if (pw <= util) agregar(pieza, b, pw);
            else porCaracteres(pieza, b);
          } else porCaracteres(pieza, b);
        }
      }
    });
  });
  if (cur.length || !lineas.length) cerrar(false);
  return lineas;
}

function dibujar(doc: Doc, lineas: Linea[], x: number, y0: number, width: number, s: number, alin: Alin = 'left', paso = interlinea(s)): void {
  lineas.forEach((ln, i) => {
    let xx = alin === 'left' ? x : alin === 'center' ? x + (width - ln.w) / 2 : x + width - ln.w;
    const yy = y0 + i * paso + AJUSTE_Y * s;
    for (const sg of ln.segs) {
      fuente(doc, sg.b, s).text(sg.t, xx, yy, { lineBreak: false });
      xx += sg.w;
    }
  });
}

/** Escribe un bloque y devuelve cuántas líneas ocupó. */
function texto(doc: Doc, runs: Run[] | string, x: number, y0: number, width: number, s: number, alin: Alin = 'left', bold = false): number {
  const r = typeof runs === 'string' ? [{ t: runs, b: bold }] : runs;
  const lineas = envolver(doc, r, width, s);
  dibujar(doc, lineas, x, y0, width, s, alin);
  return lineas.length;
}

function lineasDe(doc: Doc, runs: Run[] | string, width: number, s: number, bold = false): number {
  return envolver(doc, typeof runs === 'string' ? [{ t: runs, b: bold }] : runs, width, s).length;
}

function hLinea(doc: Doc, x0: number, x1: number, y: number, w = LINEA): void {
  doc.save().lineWidth(w).strokeColor('#000000').moveTo(x0, y).lineTo(x1, y).stroke().restore();
}

function vLinea(doc: Doc, x: number, y0: number, y1: number, w = LINEA): void {
  doc.save().lineWidth(w).strokeColor('#000000').moveTo(x, y0).lineTo(x, y1).stroke().restore();
}

function marco(doc: Doc, x0: number, y0: number, x1: number, y1: number): void {
  doc.save().lineWidth(MARCO).strokeColor('#000000').rect(x0, y0, x1 - x0, y1 - y0).stroke().restore();
}

function relleno(doc: Doc, x0: number, y0: number, x1: number, y1: number, color: string): void {
  doc.save().fillColor(color).rect(x0, y0, x1 - x0, y1 - y0).fill().restore();
  doc.fillColor('#000000');
}

// ───────────────────────── bloques comunes ─────────────────────────

function encabezado(doc: Doc, p: Plantilla, f: FacturaDian, qrPng: Buffer | null): void {
  const [lx, ly, lw, lh] = p.logo;
  doc.image(Buffer.from(LOGO_FACTURA_PNG_BASE64, 'base64'), lx, ly, { width: lw, height: lh });
  const e = EMISOR_OBEN;
  const empresa: Array<[string, boolean]> = [
    [e.razonSocial, true],
    [`NIT ${e.nit}`, true],
    [e.direccion, false],
    [e.ciudad, false],
    [e.telefono, false],
    [e.correo, false],
  ];
  empresa.forEach(([t, b], i) => texto(doc, t, p.empresaX, p.filasEncabezado[i], 170, p.s, 'left', b));
  const regimen = [...e.regimen, `RESOLUCION No. ${f.resolucion.numero} DE ${f.resolucion.fecha}`, e.agenteIca];
  regimen.forEach((t, i) => texto(doc, t, p.regimenX, p.filasEncabezado[i], p.anchoRegimen, p.s, 'left', true));
  if (qrPng) doc.image(qrPng, p.qr[0], p.qr[1], { width: QR_LADO, height: QR_LADO });
  const [tx0, ty0, tx1, ty1] = p.tituloCaja;
  relleno(doc, tx0, ty0, tx1, ty1, GRIS_TITULO);
  marco(doc, tx0, ty0, tx1, ty1);
  p.titulo(f.numero ?? 'BORRADOR').forEach((t, i) => texto(doc, t, tx0, p.tituloY[i], tx1 - tx0, 7, 'center', true));
}

/** Recuadro del cliente; devuelve la y donde termina (inicio de la tabla). */
function recuadroCliente(doc: Doc, p: Plantilla, f: FacturaDian): number {
  const c = f.cliente;
  const s = p.s;
  const lh = interlinea(s);
  const ancho5 = (i: number, j = i) => CC[j + 1] - CC[i] - 2 * p.padX;
  const val = (v: string | null) => (v ? ` ${v}` : '');
  type Celda = { col: number; hasta?: number; runs: Run[]; alin?: Alin };
  const valorDerecha = (v: string | null, col: number): Celda => ({ col, runs: [{ t: v ?? '' }], alin: p.valoresCentrados ? 'center' : 'left' });
  const filas: Celda[][] = [
    [
      { col: 0, runs: [{ t: 'CLIENTE / CUSTOMER:', b: true }, { t: val(c.nombre) }] },
      { col: 1, runs: [{ t: 'DIRECCION / ADDRESS:', b: true }, { t: val(c.direccion) }] },
      { col: 2, runs: [{ t: 'FECHA EMISION / ISSUE DATE', b: true }] },
      { col: 3, runs: [{ t: 'FECHA VENCIMIENTO / DUE DATE', b: true }] },
      { col: 4, runs: [{ t: 'No. PEDIDO / ORDER', b: true }] },
    ],
    [
      { col: 0, runs: [{ t: 'NIT:', b: true }, { t: val(c.nit) }] },
      { col: 1, runs: [{ t: 'CIUDAD / CITY:', b: true }, { t: c.ciudad ? `  ${c.ciudad}` : '' }] },
      valorDerecha(f.fechaEmision, 2),
      valorDerecha(f.fechaVencimiento, 3),
      valorDerecha(f.pedido, 4),
    ],
    [
      { col: 0, runs: [{ t: p.etiquetaDireccion2, b: true }, { t: val(c.direccion) }] },
      { col: 1, runs: [{ t: 'PAIS / COUNTRY:', b: true }, { t: val(c.pais) }] },
      { col: 2, runs: [{ t: 'CONDICIONES DE VENTAS / SALES CONDITIONS', b: true }] },
      { col: 3, runs: [{ t: 'ORDEN DE COMPRA / PURCHASE ORDER', b: true }] },
      { col: 4, runs: [{ t: 'REMISION / SEND', b: true }] },
    ],
    [
      { col: 0, runs: [{ t: 'CIUDAD / CITY:', b: true }, { t: c.ciudad ? `  ${c.ciudad}` : '' }] },
      valorDerecha(f.condicionesVenta, 2),
      valorDerecha(f.ordenCompra, 3),
      valorDerecha(f.remision, 4),
    ],
    [
      { col: 0, runs: [{ t: 'DEPARTAMENTO / DEPARTAMENT:', b: true }, { t: val(c.departamento) }] },
      {
        col: 2,
        hasta: 4,
        runs: [{ t: `Resolución Facturación No. ${f.resolucion.numero} del ${f.resolucion.vigenteDesde} al ${f.resolucion.vigenteHasta} Rango del ${f.resolucion.prefijo}${f.resolucion.desde} al ${f.resolucion.prefijo}${f.resolucion.hasta}` }],
      },
    ],
    [
      { col: 0, runs: [{ t: 'TELEFONO / TELEPHONE:', b: true }, { t: c.telefono ? `\n${c.telefono}` : '' }] },
      {
        col: 2,
        hasta: 4,
        runs: [{ t: `Billing Resolution No. ${f.resolucion.numero} from ${f.resolucion.vigenteDesde} to ${f.resolucion.vigenteHasta} Range from ${f.resolucion.prefijo}${f.resolucion.desde} to ${f.resolucion.prefijo}${f.resolucion.hasta}` }],
      },
    ],
    [
      { col: 0, runs: [{ t: 'CORREO ELECTRONICO / E-MAIL:', b: true }, { t: c.correo ? `\n${c.correo}` : '' }] },
      { col: 2, hasta: 3, runs: [{ t: 'Medio de Pago / Payment Method:', b: true }, { t: ` ${f.medioPago}` }] },
      { col: 4, runs: [{ t: 'Forma de Pago / Payment Type:', b: true }, { t: ` ${f.formaPago}` }] },
    ],
  ];
  const top = p.clienteY;
  let y = top;
  let finDerecha = top;
  filas.forEach((fila, i) => {
    const n = Math.max(...fila.map((cel) => lineasDe(doc, cel.runs, ancho5(cel.col, cel.hasta), s)));
    const alto = Math.max(p.filaMin, p.padTop + n * lh + p.padBot(n));
    for (const cel of fila) {
      texto(doc, cel.runs, CC[cel.col] + p.padX, y + p.padTop, ancho5(cel.col, cel.hasta), s, cel.alin ?? 'left');
    }
    y += alto;
    // Líneas de la parte derecha: bajo las fechas (fila 2) y bajo condiciones/OC/remisión (fila 4).
    if (i === 1 || i === 3) {
      hLinea(doc, CC[2], CC[5], y);
      finDerecha = y;
    }
  });
  hLinea(doc, CC[0], CC[5], top);
  for (const x of [CC[0], CC[1], CC[2], CC[5]]) vLinea(doc, x, top, y);
  for (const x of [CC[3], CC[4]]) vLinea(doc, x, top, finDerecha);
  return y;
}

/** Encabezado gris de la tabla de ítems; devuelve la y donde empieza el cuerpo. */
function encabezadoTabla(doc: Doc, p: Plantilla, y: number): number {
  const s = p.s;
  const lh = interlinea(s);
  const alto = p.s < 6 ? 31.4 : 31.5;
  const sub = 17.3;
  const celdas: Array<[number, number, string, number, number]> = [
    [COL.item, COL.codigo, 'No. ITEM', y, y + alto],
    [COL.codigo, COL.desc, 'CÓDIGO / CODE', y, y + alto],
    [COL.desc, COL.cant, 'DESCRIPCIÓN / DESCRIPTION', y, y + alto],
    [COL.cant, COL.um, 'CANTIDAD / QUANTITY', y, y + alto],
    [COL.um, COL.unit, 'UM / UNIT', y, y + alto],
    [COL.unit, COL.ivaPct, 'VALOR UNITARIO / UNIT VALUE', y, y + alto],
    [COL.ivaPct, COL.total, 'IMPUESTOS / TAXES', y, y + sub],
    [COL.ivaPct, COL.ivaVal, '%', y + sub, y + alto],
    [COL.ivaVal, COL.total, 'VALOR / VALUE', y + sub, y + alto],
    [COL.total, COL.fin, 'VALOR TOTAL / TOTAL VALUE', y, y + alto],
  ];
  for (const [x0, x1, t, y0, y1] of celdas) {
    relleno(doc, x0, y0, x1, y1, GRIS_CELDA);
    const w = x1 - x0 - 2 * p.padX;
    const n = lineasDe(doc, t, w, s, true);
    texto(doc, t, x0 + p.padX, y0 + (y1 - y0 - n * lh) / 2 + 0.13 * s, w, s, 'center', true);
  }
  hLinea(doc, COL.item, COL.fin, y);
  hLinea(doc, COL.item, COL.fin, y + alto);
  for (const x of [COL.item, COL.codigo, COL.desc, COL.cant, COL.um, COL.unit, COL.ivaPct, COL.total, COL.fin]) vLinea(doc, x, y, y + alto);
  return y + alto;
}

/** Líneas verticales del cuerpo de la tabla entre `y0` y `y1`. */
function columnasCuerpo(doc: Doc, y0: number, y1: number): void {
  for (const x of [COL.item, COL.codigo, COL.desc, COL.cant, COL.um, COL.unit, COL.ivaPct, COL.ivaVal, COL.total, COL.fin]) vLinea(doc, x, y0, y1);
}

interface FilaItem {
  linea: FacturaDianLinea;
  celdas: Array<{ x0: number; x1: number; t: string; alin: Alin }>;
  alto: number;
}

function prepararFilas(doc: Doc, p: Plantilla, f: FacturaDian): FilaItem[] {
  const lh = interlinea(p.s);
  return f.lineas.map((l) => {
    const celdas: FilaItem['celdas'] = [
      { x0: COL.item, x1: COL.codigo, t: String(l.item), alin: 'center' },
      { x0: COL.codigo, x1: COL.desc, t: l.codigo, alin: 'left' },
      { x0: COL.desc, x1: COL.cant, t: l.descripcion, alin: 'left' },
      { x0: COL.cant, x1: COL.um, t: cantidadTxt(l.cantidad), alin: 'center' },
      { x0: COL.um, x1: COL.unit, t: l.unidad, alin: 'center' },
      { x0: COL.unit, x1: COL.ivaPct, t: enUS(l.valorUnitario, 4), alin: 'right' },
      { x0: COL.ivaPct, x1: COL.ivaVal, t: `IVA ${pctTxt(l.ivaPct)}`, alin: 'center' },
      { x0: COL.ivaVal, x1: COL.total, t: enUS(l.ivaValor, 4), alin: 'right' },
      { x0: COL.total, x1: COL.fin, t: enUS(l.total, 2), alin: 'right' },
    ];
    const n = Math.max(...celdas.map((c) => lineasDe(doc, c.t, c.x1 - c.x0 - 2 * p.padX, p.s)));
    return { linea: l, celdas, alto: Math.max(p.filaItemsMin, p.itemsPadTop + n * lh + p.itemsPadBot) };
  });
}

function dibujarFila(doc: Doc, p: Plantilla, fila: FilaItem, y: number): void {
  for (const c of fila.celdas) texto(doc, c.t, c.x0 + p.padX, y + p.itemsPadTop, c.x1 - c.x0 - 2 * p.padX, p.s, c.alin);
}

function qrPng(contenido: string): Promise<Buffer | null> {
  return bwipjs
    .toBuffer({ bcid: 'qrcode', text: contenido, scale: 4, paddingwidth: 0, paddingheight: 0 })
    .catch(() => null);
}

function marcaAgua(doc: Doc, texto: string | null): void {
  if (!texto) return;
  doc.save();
  doc.rotate(-35, { origin: [306, 396] });
  fuente(doc, true, 70);
  const w = doc.widthOfString(texto);
  doc.fillColor('#9CA3AF').fillOpacity(0.18).text(texto, 306 - w / 2, 370, { lineBreak: false });
  doc.restore();
  doc.fillColor('#000000').fillOpacity(1);
}

/**
 * FastReport no aplica kerning; pdfkit sí (pares AFM como "TA", "AV"), lo que
 * angostaba palabras como "DEPARTAMENTO" hasta 2 pt. Cada documento tiene su
 * propia copia de la fuente, así que esto no afecta otros PDF.
 */
function sinKerning(doc: Doc): void {
  for (const nombre of ['Helvetica', 'Helvetica-Bold']) {
    doc.font(nombre);
    const afm = (doc as unknown as { _font?: { font?: { kernPairs?: Record<string, number> } } })._font?.font;
    if (afm?.kernPairs) afm.kernPairs = {};
  }
}

function nuevoDoc(): { doc: Doc; fin: Promise<Buffer> } {
  const doc = new PDFDocument({ size: 'LETTER', margin: 0, bufferPages: true, info: { Title: 'Factura electrónica Oben', Creator: 'Oben Xmart' } });
  sinKerning(doc);
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const fin = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, fin };
}

const cufeTxt = (f: FacturaDian) =>
  f.cufe ? `CUFE: ${f.cufe}${f.cufeSimulado ? ' (SIMULADO — sin validez fiscal)' : ''}` : 'CUFE: (se asigna al emitir la factura en la DIAN)';

// ───────────────────────── FV — nacional ─────────────────────────

export async function facturaNacionalPdf(f: FacturaDian): Promise<Buffer> {
  const p = NACIONAL;
  const s = p.s;
  const lh = interlinea(s);
  const qr = await qrPng(f.qr);

  // Medidas en una hoja de prueba: filas, observaciones y dónde empieza el cuerpo.
  const { doc: m, fin: finM } = nuevoDoc();
  const filas = prepararFilas(m, p, f);
  const nObs = f.observaciones.length ? lineasDe(m, f.observaciones.join('\n'), 583.4 - 28.4 - 2 * p.padX, s) : 0;
  encabezado(m, p, f, null);
  const cuerpoInicio = encabezadoTabla(m, p, recuadroCliente(m, p, f));
  void finM.catch(() => undefined);
  m.end();

  // El resumen va anclado abajo (como el original): el cuerpo de la tabla se estira hasta las observaciones.
  const totalesTop = 578.5;
  const totalesFin = 658.1;
  const obsAlto = 1.4 + (1 + nObs) * lh + 0.9;
  const obsTop = totalesTop - 2.3 - obsAlto;
  const plan: FilaItem[][] = [];
  for (let i = 0; ; ) {
    const restantes = filas.slice(i);
    if (cuerpoInicio + restantes.reduce((a, x) => a + x.alto, 0) <= obsTop - 14) {
      plan.push(restantes);
      break;
    }
    const pagina: FilaItem[] = [];
    let y = cuerpoInicio;
    while (i < filas.length && (y + filas[i].alto <= totalesFin || !pagina.length)) {
      pagina.push(filas[i]);
      y += filas[i].alto;
      i++;
    }
    plan.push(pagina);
  }

  const { doc, fin } = nuevoDoc();
  return pintarConPlan(
    doc,
    fin,
    plan,
    (d, items, ultima) => {
      encabezado(d, p, f, qr);
      const cuerpo = encabezadoTabla(d, p, recuadroCliente(d, p, f));
      let y = cuerpo;
      for (const fila of items) {
        dibujarFila(d, p, fila, y);
        y += fila.alto;
      }
      const finCuerpo = ultima ? obsTop : totalesFin;
      columnasCuerpo(d, cuerpo, finCuerpo);
      hLinea(d, COL.item, COL.fin, finCuerpo);
      if (ultima) {
        texto(d, `Total Nro Lineas / Total number of lines : ${f.lineas.length}`, COL.desc + p.padX, finCuerpo - 12.7, 200, s);
        resumenNacional(d, p, f, obsTop, obsAlto, totalesTop, totalesFin);
      }
    },
    (d, i, n) => {
      pieNacional(d, f);
      texto(d, `Página ${i} de ${n}`, 519.7, 726.3, 60, s);
      marcaAgua(d, f.marcaAgua);
    },
  );
}

async function pintarConPlan<T>(
  doc: Doc,
  fin: Promise<Buffer>,
  plan: T[],
  pagina: (doc: Doc, items: T, ultima: boolean) => void,
  pie: (doc: Doc, i: number, n: number) => void,
): Promise<Buffer> {
  plan.forEach((items, i) => {
    if (i > 0) doc.addPage({ size: 'LETTER', margin: 0 });
    pagina(doc, items, i === plan.length - 1);
  });
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);
    pie(doc, i + 1, rango.count);
  }
  doc.end();
  return fin;
}

function resumenNacional(doc: Doc, p: Plantilla, f: FacturaDian, obsTop: number, obsAlto: number, top: number, finTotales: number): void {
  const s = p.s;
  const lh = interlinea(s);
  const x = 28.4 + p.padX;
  // Observaciones
  marco(doc, 28.4, obsTop, 583.4, obsTop + obsAlto);
  texto(doc, 'OBSERVACIONES / COMMENTS:', x, obsTop + 1.4, 300, s, 'left', true);
  if (f.observaciones.length) texto(doc, f.observaciones.join('\n'), x, obsTop + 1.4 + lh, 583.4 - 28.4 - 2 * p.padX, s);
  // Totales
  marco(doc, 28.4, top, 583.4, finTotales);
  const izq = 371.6 - 28.4 - 2 * p.padX;
  texto(doc, 'VALOR LETRAS / TOTAL AMOUNT:', x, top + 1.4, izq, s, 'left', true);
  const nSon = texto(doc, f.valorLetras, x, top + 1.4 + lh, izq, s);
  if (f.valorLetrasIngles) texto(doc, f.valorLetrasIngles, x, top + 1.4 + (1 + nSon) * lh, izq, s);
  hLinea(doc, 28.4, 371.6, top + 31.1);
  texto(doc, [{ t: 'INCOTERMS:', b: true }, { t: f.incoterm ? ` ${f.incoterm}` : '' }], x, top + 32.5, izq, s);
  vLinea(doc, 371.6, top, top + 39.5);
  const xr = 371.6 + p.padX;
  const wr = 583.4 - 371.6 - 2 * p.padX;
  const fila = (etiqueta: string, valor: number, dy: number, negrilla = false) => {
    texto(doc, etiqueta, xr, top + dy, wr, s, 'left', true);
    texto(doc, enUS(valor, 2), xr, top + dy, wr, s, 'right', negrilla);
  };
  relleno(doc, 484.6, top + 31.1, 583.4, top + 39.5, GRIS_CELDA);
  fila('SUBTOTAL', f.subtotal, 1.4);
  fila(`I.V.A. ${pctTxt(f.ivaPct)}%  COP / TAXES`, f.iva, 15.5);
  fila('RETEFUENTE', f.retefuente, 24.0);
  fila('NETO A PAGAR/ TOTAL VALUE', f.neto, 32.5, true);
  hLinea(doc, 28.4, 583.4, top + 39.5);
  TEXTO_LEGAL_NACIONAL.forEach((t, i) => texto(doc, t, x, top + 40.9 + i * lh, 583.4 - 28.4 - 2 * p.padX, s));
  texto(doc, 'NOMBRE Y APELLIDOS / NAME:', 284.8, top + 70.2, 120, s, 'left', true);
}

function pieNacional(doc: Doc, f: FacturaDian): void {
  const s = 5;
  texto(doc, 'Representación Gráfica De Factura Electronica De Venta / Graphic Representation Of Electronic Sales Invoice', 28.4, 684.8, 580.6 - 28.4 + 4.6, s, 'center', true);
  hLinea(doc, 28.4, 583.4, 698.3);
  texto(doc, cufeTxt(f), 30.6, 710.2, 480, s, 'left', true);
  texto(doc, `FECHA VALIDACION DIAN: ${f.resolucion.fecha}`, 30.6, 718.6, 300, s);
  texto(doc, EMISOR_OBEN.proveedorTecnologico, 30.6, 727.1, 300, s, 'left', true);
}

// ───────────────────────── FEXP — exportación ─────────────────────────

type BloqueExp = { tipo: 'item'; fila: FilaItem } | { tipo: 'resumen1' } | { tipo: 'resumen2' };

export async function facturaExportacionPdf(f: FacturaDian): Promise<Buffer> {
  const p = EXPORTACION;
  const s = p.s;
  const lh = interlinea(s);
  const { doc, fin } = nuevoDoc();
  const qr = await qrPng(f.qr);
  const filas = prepararFilas(doc, p, f);

  // Alto de cada bloque del resumen (dependen solo de los textos).
  const anchoObs = 583.7 - 28.4 - 2 * p.padX;
  const nObs = lineasDe(doc, f.observaciones.join('\n'), anchoObs, s);
  const obsAlto = 1.8 + (1 + nObs) * lh + 2.3 + s + 1.6;
  const alto1 = 14.1 + obsAlto + 4.9 + 52.2;
  const nSon = lineasDe(doc, f.valorLetras, 422.3 - 28.4 - 2 * p.padX, s);
  const filaSon = Math.max(14.1, 1.7 + nSon * lh + 1.0);
  const alto2 = filaSon + 54.7;

  // Para saber dónde empieza el cuerpo se mide el recuadro del cliente en una hoja de prueba.
  encabezado(doc, p, f, null);
  const cuerpoInicio = encabezadoTabla(doc, p, recuadroCliente(doc, p, f));
  void fin.catch(() => undefined);
  doc.end();

  // Plan de páginas: ítems; luego resumen 1 (líneas + observaciones + subtotal/IVA/flete) y resumen 2
  // (valor en letras, seguro, neto), cada uno entero en una página, como FastReport.
  type Pag = { bloques: Array<{ b: BloqueExp; y: number }>; pieY: number };
  const plan: Pag[] = [];
  let pag: Pag = { bloques: [], pieY: 0 };
  let y = cuerpoInicio;
  const cerrar = (pieY: number) => {
    pag.pieY = pieY;
    plan.push(pag);
    pag = { bloques: [], pieY: 0 };
    y = cuerpoInicio;
  };
  for (const fila of filas) {
    if (pag.bloques.length && y + fila.alto - 0.7 + PIE_EXP > LIMITE_EXP) cerrar(y - 0.7);
    pag.bloques.push({ b: { tipo: 'item', fila }, y });
    y += fila.alto;
  }
  if (pag.bloques.length && y + alto1 + 8.1 + PIE_EXP > LIMITE_EXP) cerrar(y - 0.7);
  pag.bloques.push({ b: { tipo: 'resumen1' }, y });
  y += alto1;
  if (y + alto2 - 0.8 + PIE_EXP > LIMITE_EXP) cerrar(y + 8.1);
  pag.bloques.push({ b: { tipo: 'resumen2' }, y });
  y += alto2;
  cerrar(y - 0.8);

  const { doc: d, fin: fin2 } = nuevoDoc();
  return pintarConPlan(
    d,
    fin2,
    plan,
    (dd, pg) => {
      encabezado(dd, p, f, qr);
      const finCliente = recuadroCliente(dd, p, f);
      const cuerpo = encabezadoTabla(dd, p, finCliente);
      let yy = cuerpo;
      for (const { b, y: by } of pg.bloques) {
        if (b.tipo === 'item') {
          dibujarFila(dd, p, b.fila, by);
          yy = by + b.fila.alto;
        } else if (b.tipo === 'resumen1') {
          yy = resumenExportacion1(dd, p, f, by, obsAlto);
        } else {
          yy = resumenExportacion2(dd, p, f, by, filaSon);
        }
      }
      const primerBloque = pg.bloques[0]?.b.tipo;
      if (primerBloque === 'item') {
        const ultimoItem = [...pg.bloques].reverse().find((x) => x.b.tipo === 'item')!;
        const finItems = ultimoItem.y + (ultimoItem.b as { fila: FilaItem }).fila.alto;
        columnasCuerpo(dd, cuerpo, finItems);
      }
      void yy;
    },
    (dd, i, n) => {
      pieExportacion(dd, f, plan[i - 1].pieY, i, n);
      marcaAgua(dd, f.marcaAgua);
    },
  );
}

/** Fila "Total Nro Lineas" + observaciones + subtotal/IVA/flete. Devuelve la y final. */
function resumenExportacion1(doc: Doc, p: Plantilla, f: FacturaDian, y: number, obsAlto: number): number {
  const s = p.s;
  const lh = interlinea(s);
  const x = 28.4 + p.padX;
  // Fila del total de líneas (con las columnas de la tabla).
  const filaTotal = y + 14.1;
  columnasCuerpo(doc, y, filaTotal);
  texto(doc, `Total Nro Lineas / Total number of lines : ${f.lineas.length}`, COL.desc + 2.5, y + 1.6, 200, 6.5);
  // Observaciones
  const oTop = filaTotal;
  marco(doc, 28.4, oTop, 583.7, oTop + obsAlto);
  texto(doc, 'OBSERVACIONES / COMMENTS:', x, oTop + 1.8, 300, s, 'left', true);
  const n = texto(doc, f.observaciones.join('\n'), x, oTop + 1.8 + lh, 583.7 - 28.4 - 2 * p.padX, s);
  texto(
    doc,
    [{ t: 'TIPO DE CAMBIO / EXCHANGE RATE:', b: true }, { t: f.tipoCambio ? ` ${f.tipoCambio}` : '' }],
    x,
    oTop + 1.8 + (1 + n) * lh + 2.3,
    400,
    s,
  );
  // Totales (lista de empaque / unidades / aviso de recibo | subtotal, IVA, flete)
  const t = oTop + obsAlto + 4.9;
  marco(doc, 28.4, t, 583.6, t + 52.2);
  vLinea(doc, 159.7, t, t + 38.0);
  vLinea(doc, 291.0, t, t + 38.0);
  vLinea(doc, 422.3, t, t + 52.2);
  hLinea(doc, 28.4, 422.3, t + 38.0);
  texto(doc, 'TOTAL LISTA DE EMPAQUE / TOTAL PACKING LIST', x, t + 1.7, 159.7 - 28.4 - 2 * p.padX, s, 'left', true);
  texto(doc, 'TOTAL UNIDADES / TOTAL UNITS', 159.7 + p.padX, t + 1.7, 291.0 - 159.7 - 2 * p.padX, s, 'left', true);
  texto(doc, 'NÚMERO AVISO DE RECIBO / RECEIPT NOTICE', 291.0 + p.padX, t + 1.7, 422.3 - 291.0 - 2 * p.padX, s, 'left', true);
  texto(doc, 'VALOR LETRAS / TOTAL AMOUNT:', x, t + 39.7, 300, s, 'left', true);
  const xr = 422.3 + p.padX;
  const wr = 583.6 - 422.3 - 2 * p.padX;
  const fila = (etiqueta: string, valor: number, dy: number) => {
    texto(doc, etiqueta, xr, t + dy, ETIQUETA_TOTALES_EXP, s, 'left', true);
    texto(doc, enUS(valor, 2), xr, t + dy, wr, s, 'right');
  };
  fila('SUBTOTAL', f.subtotal, 1.7);
  fila(`I.V.A. ${pctTxt(f.ivaPct)}% USD / TAXES`, f.iva, 19.9);
  fila('FLETE/ FREIGHT', f.flete, 39.7);
  return t + 52.2;
}

/** Valor en letras, seguro, (otros gastos), incoterm y neto a pagar. Devuelve la y final. */
function resumenExportacion2(doc: Doc, p: Plantilla, f: FacturaDian, y: number, filaSon: number): number {
  const s = p.s;
  const x = 28.4 + p.padX;
  const alto = filaSon + 54.7;
  marco(doc, 28.4, y, 583.6, y + alto);
  vLinea(doc, 422.3, y, y + alto);
  hLinea(doc, 28.4, 422.3, y + filaSon);
  texto(doc, f.valorLetras, x, y + 1.7, 422.3 - 28.4 - 2 * p.padX, s);
  texto(doc, [{ t: 'INCOTERMS:', b: true }, { t: f.incoterm ? ` ${f.incoterm}` : '' }], x, y + filaSon + 1.8, 300, s);
  const xr = 422.3 + p.padX;
  const wr = 583.6 - 422.3 - 2 * p.padX;
  texto(doc, 'SEGURO/ INSURANCE', xr, y + 1.7, ETIQUETA_TOTALES_EXP, s, 'left', true);
  texto(doc, enUS(f.seguro, 2), xr, y + 1.7, wr, s, 'right');
  if (f.otrosGastos) {
    texto(doc, 'OTROS GASTOS / OTHER EXPENSES', xr, y + 15.9, ETIQUETA_TOTALES_EXP, s, 'left', true);
    texto(doc, enUS(f.otrosGastos, 2), xr, y + 15.9, wr, s, 'right');
  }
  const netoY = y + alto - 20.5;
  relleno(doc, 519.4, netoY, 583.6, y + alto, GRIS_CELDA);
  texto(doc, 'NETO A PAGAR/ TOTAL VALUE', xr, netoY + 1.8, ETIQUETA_TOTALES_EXP, s, 'left', true);
  texto(doc, enUS(f.neto, 2), xr, netoY + 1.8, wr, s, 'right');
  marco(doc, 28.4, y, 583.6, y + alto);
  return y + alto;
}

function pieExportacion(doc: Doc, f: FacturaDian, y0: number, pagina: number, total: number): void {
  const s = 7.5;
  marco(doc, 28.4, y0, 583.7, y0 + 34.6);
  texto(
    doc,
    `TIPO DE MONEDA/CURRENCY: DOLLARS /  FORMA DE PAGO:  ${f.terminosPago ?? ''} / ${EMISOR_OBEN.cuentaExportacion}`,
    31.0,
    y0 + 1.7,
    583.7 - 28.4 - 5.2,
    s,
  );
  vLinea(doc, 252.2, y0 + 20.6, y0 + 34.5);
  texto(doc, 'NOMBRE Y APELLIDOS / NAME:', 254.7, y0 + 22.0, 120, 6, 'left', true);
  texto(doc, 'Representación Gráfica De Factura Electrónica De Venta Exportación / Graphic Representation Of Electronic Sales Invoice Export', 28.4, y0 + 71.2, 552.6, s, 'center', true);
  texto(doc, cufeTxt(f), 31.0, y0 + 86.7, 540, s, 'left', true);
  texto(doc, `FECHA VALIDACION DIAN: ${f.resolucion.fecha}`, 31.0, y0 + 98.3, 300, s, 'left', true);
  texto(doc, EMISOR_OBEN.proveedorTecnologico, 31.0, y0 + 109.8, 300, s, 'left', true);
  texto(doc, `Página ${pagina} de ${total}`, 508.5, y0 + 113.0, 60, 5, 'left', true);
}

export function facturaDianPdf(f: FacturaDian): Promise<Buffer> {
  return f.tipo === 'exportacion' ? facturaExportacionPdf(f) : facturaNacionalPdf(f);
}
