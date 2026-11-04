import { Logger } from '@nestjs/common';
import { inflateSync } from 'zlib';
import * as XLSX from 'xlsx';
import type { CasoLinea } from '../../entities/comercial-case.entity';
import { aKilos, aMicras, aMilimetros, parseNumero, unidadEspesor, unidadLongitud, unidadPeso } from './unidades';

export interface OcAdjunto {
  filename: string;
  contentType?: string | null;
  content?: Buffer | null;
}

export interface EquivalenciaRef {
  id: string;
  clientCode: string;
  obenCode: string;
}

export interface OcExtraccion {
  numero: string | null;
  fechaRequerida: string | null;
  direccionEntrega: string | null;
  clienteFinal: string | null;
  lineas: CasoLinea[];
  extraidoPor: 'reglas' | 'ia';
  notas: string[];
}

/** Campos de una línea tal como se leyeron (por reglas o por IA), antes de traducir. */
export interface LineaCampos {
  textoCliente: string;
  codigoCliente?: string | null;
  cantidad?: number | null;
  unidad?: string | null;
  ancho?: number | null;
  unidadAncho?: string | null;
  espesor?: number | null;
  unidadEspesor?: string | null;
  precioUnitario?: number | null;
  moneda?: string | null;
}

export interface OcIaConfig {
  host: string;
  model: string;
  timeoutMs?: number;
}

export interface EjemploOc {
  entrada: string;
  salida: unknown;
}

const logger = new Logger('OcExtractor');

/**
 * Cuando el cliente escribe las líneas en el correo Y adjunta la orden con las mismas líneas, cada línea se leería
 * dos veces (el doble de kilos). Se quitan del texto del adjunto las líneas que ya están, iguales, en el cuerpo.
 * Devuelve el texto del adjunto sin repetidas y cuántas quitó.
 */
export function sinLineasRepetidas(cuerpo: string, textoAdjuntos: string): { texto: string; quitadas: number } {
  const norm = (l: string) => l.trim().toLowerCase().replace(/^[\s\-*•\d.)|]+/, '').replace(/\s+/g, ' ');
  const enCuerpo = new Set(cuerpo.split(/\r?\n/).map(norm).filter((l) => l.length > 8));
  let quitadas = 0;
  const texto = textoAdjuntos
    .split(/\r?\n/)
    .filter((l) => {
      const n = norm(l);
      if (n.length > 8 && enCuerpo.has(n)) {
        quitadas++;
        return false;
      }
      return true;
    })
    .join('\n');
  return { texto, quitadas };
}

// ─── Texto de los adjuntos ─────────────────────────────────────────────────

/** Lee con visión una imagen o un PDF escaneado (IaModelosService.leerDocumento); null si no se pudo. */
export type LectorVisual = (a: { filename: string; contentType: string | null; content: Buffer }) => Promise<string | null>;

/** Imágenes que son firma, banner o logo del correo: nunca son la orden (3-nov: las firmas de Oben llenaban el caso de avisos). */
const IMAGEN_DE_FIRMA = /firma|banner|logo|signature|footer|facebook|linkedin|twitter|instagram|youtube|spacer|pixel|icon/i;
const MAX_LECTURAS_VISUALES = 4;
const MIN_BYTES_IMAGEN_UTIL = 15_000;

/**
 * Texto legible de los adjuntos: PDF con texto, Excel y CSV/TXT. Imágenes y PDF escaneados se leen con visión si hay
 * `leerVisual`; sin él (o si falla) quedan "no leído" para revisión humana. Las imágenes de firma/banner se ignoran.
 */
export async function textoDeAdjuntos(
  adjuntos: OcAdjunto[],
  leerVisual?: LectorVisual,
): Promise<{ texto: string; resumen: Array<{ filename: string; contentType: string | null; bytes: number; leido: boolean }>; notas: string[] }> {
  const partes: string[] = [];
  const notas: string[] = [];
  const resumen: Array<{ filename: string; contentType: string | null; bytes: number; leido: boolean }> = [];
  const esImg = (a: OcAdjunto) => {
    const e = ((a.filename || '').split('.').pop() ?? '').toLowerCase();
    return /^(png|jpe?g|gif|bmp|tiff?|heic|webp)$/.test(e) || (a.contentType ?? '').toLowerCase().startsWith('image/');
  };
  // Una imagen con el MISMO tamaño que una firma es la misma firma con otro nombre (image001.png = firma digital).
  const tamanosDeFirma = new Set(adjuntos.filter((a) => esImg(a) && IMAGEN_DE_FIRMA.test(a.filename || '') && a.content).map((a) => a.content!.length));
  let lecturasVisuales = 0;
  for (const a of adjuntos) {
    const buf = a.content ?? null;
    const name = a.filename || 'adjunto';
    const ext = (name.split('.').pop() ?? '').toLowerCase();
    const ct = (a.contentType ?? '').toLowerCase();
    let texto: string | null = null;
    try {
      if (!buf || buf.length === 0) texto = null;
      else if (ext === 'pdf' || ct.includes('pdf')) texto = await pdfTexto(buf);
      else if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('spreadsheet') || ct.includes('excel') || ct.includes('csv')) {
        const wb = XLSX.read(buf, { type: 'buffer', raw: false });
        // Tabulador como separador (no se entrecomilla nada con espacios) y luego " | ".
        texto = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: '\t', blankrows: false }).replace(/\t/g, ' | ')).join('\n');
      } else if (ext === 'txt' || ct.startsWith('text/')) texto = buf.toString('utf8');
    } catch (err) {
      logger.warn(`No se pudo leer el adjunto "${name}": ${(err as Error).message}`);
      texto = null;
    }
    let leidoConIa = false;
    if (!(texto && texto.trim()) && buf && buf.length > 0) {
      const esImagen = /^(png|jpe?g|gif|bmp|tiff?|heic|webp)$/.test(ext) || ct.startsWith('image/');
      const esPdf = ext === 'pdf' || ct.includes('pdf');
      if (esImagen && (IMAGEN_DE_FIRMA.test(name) || tamanosDeFirma.has(buf.length) || buf.length < MIN_BYTES_IMAGEN_UTIL)) {
        resumen.push({ filename: name, contentType: a.contentType ?? null, bytes: buf.length, leido: false });
        continue; // firma, banner o logo: ni se lee ni se avisa
      }
      if (leerVisual && (esImagen || esPdf) && lecturasVisuales < MAX_LECTURAS_VISUALES) {
        lecturasVisuales++;
        try {
          const v = await leerVisual({ filename: name, contentType: a.contentType ?? null, content: buf });
          if (v && v.trim()) {
            texto = v;
            leidoConIa = true;
          }
        } catch (err) {
          logger.warn(`Lectura visual de "${name}" falló: ${(err as Error).message}`);
        }
      }
    }
    const leido = !!texto && texto.trim().length > 0;
    if (leido) partes.push(`--- ${name}${leidoConIa ? ' (leído con IA)' : ''} ---\n${texto}`);
    else if (buf && buf.length > 0) {
      notas.push(
        /^(png|jpe?g|gif|bmp|tiff?|heic|webp)$/.test(ext) || ct.startsWith('image/')
          ? `El adjunto "${name}" es una imagen (pantallazo): no se lee automáticamente — revísalo y completa las líneas a mano.`
          : `El adjunto "${name}" no tiene texto legible (¿PDF escaneado?) — revísalo y completa las líneas a mano.`,
      );
    }
    resumen.push({ filename: name, contentType: a.contentType ?? null, bytes: buf?.length ?? 0, leido });
  }
  return { texto: partes.join('\n'), resumen, notas };
}

async function pdfTexto(buf: Buffer): Promise<string> {
  try {
    // lib/pdf-parse.js directo: el index del paquete intenta leer un PDF de prueba al cargarse.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string }>;
    const text = (await pdfParse(buf)).text;
    if (text.trim()) return text;
  } catch (err) {
    // pdf-parse (pdf.js 1.x) rechaza algunos PDF válidos ("bad XRef entry"): se intenta el lector básico.
    logger.debug(`pdf-parse no pudo leer el PDF (${(err as Error).message}); se usa el lector básico.`);
  }
  return pdfTextoBasico(buf);
}

/**
 * Lector de respaldo: texto de los operadores Tj/TJ/'/" de los content
 * streams (FlateDecode o sin comprimir). Cubre PDFs generados por sistemas
 * (ERP, facturadores) con fuentes estándar; no PDFs escaneados ni fuentes
 * con codificación propia — esos quedan "no leídos" para revisión humana.
 */
export function pdfTextoBasico(buf: Buffer): string {
  const raw = buf.toString('latin1');
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    const bytes = Buffer.from(raw.slice(start, end), 'latin1');
    let content: string;
    try {
      content = inflateSync(bytes).toString('latin1');
    } catch {
      content = bytes.toString('latin1');
    }
    if (!/\b(?:Tj|TJ)\b/.test(content)) continue;
    let line = '';
    const re = /\[((?:\\.|[^\]])*)\]\s*TJ|(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)\s*(?:Tj|'|")|\b(Td|TD|T\*|Tm|ET)\b/g;
    for (const t of content.matchAll(re)) {
      if (t[1] !== undefined) {
        for (const part of t[1].matchAll(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>|-?\d+(?:\.\d+)?/g)) {
          const p = part[0];
          if (p.startsWith('(') || p.startsWith('<')) line += decodePdfString(p);
          else if (Number(p) < -200) line += ' ';
        }
      } else if (t[2] !== undefined) {
        line += decodePdfString(t[2]);
      } else if (line) {
        out.push(line);
        line = '';
      }
    }
    if (line) out.push(line);
  }
  return out.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function decodePdfString(s: string): string {
  if (s.startsWith('<')) {
    const hex = s.slice(1, -1).replace(/\s/g, '');
    return Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex').toString('latin1');
  }
  return s
    .slice(1, -1)
    .replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_m, e: string) =>
      /^[0-7]+$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[e] ?? e,
    );
}

// ─── Extracción por reglas ─────────────────────────────────────────────────

const NUM = String.raw`(\d[\d.,]*)`;
const SEP = String.raw`\s*(?:\|\s*)?`;
const RE_PESO = new RegExp(`${NUM}${SEP}(kgs?|kilos?|kilogramos?|lbs?|libras?|pounds?|toneladas?|tons?)\\b`, 'i');
const RE_ANCHO_ETIQUETA = new RegExp(`(?:ancho|width|anch\\.?)\\s*[:=]?\\s*${NUM}${SEP}(mm|cm|m|in|inch(?:es)?|pulg(?:adas)?|"|'')?`, 'i');
const RE_ANCHO_SUELTO = new RegExp(`${NUM}${SEP}(mm|cms|cm|pulgadas|pulg|in|inch(?:es)?|")(?![a-z])`, 'i');
// "2 mil kg" es "dos mil kilos", no 2 mils de espesor.
const RE_ESPESOR = new RegExp(`${NUM}${SEP}(µm|μm|um|micras?|micrones|mic|mils?|g/m2|g/m²|gsm|grs?|g)(?![a-z])(?!\\s*(?:kg|kilos?|lbs?|libras?)\\b)`, 'i');
const RE_PRECIO = new RegExp(`(?:precio(?:\\s+unitario)?|price|unit\\s+price|valor\\s+unitario|p\\.?\\s*unit\\.?)\\s*[:=]?\\s*(usd|us\\$|cop|\\$)?\\s*${NUM}\\s*(usd|cop)?`, 'i');
const RE_PRECIO_SIMBOLO = new RegExp(`(u\\$d|u\\$s|us\\$|\\$)\\s*${NUM}`, 'i');
// "USD 2,50" / "2,50 USD" sin etiqueta de precio. 1 = moneda antes, 2 = valor, 3 = valor antes, 4 = moneda después.
const RE_PRECIO_MONEDA = new RegExp(`(?:\\b(usd|cop)\\s*${NUM}|${NUM}\\s*(usd|cop)\\b)`, 'i');
// "SC 25 - 640": película (letras + espesor) y ancho en mm separados por guion; el ancho de las referencias de Oben es de 4 dígitos.
const RE_CODIGO_ANCHO = new RegExp(`\\b([A-Za-z]{1,4}\\s*\\d{1,3})\\s*[-–]\\s*(\\d{3,4})\\b(?!\\s*(?:kgs?|kilos?|lbs?|libras?)\\b)`, 'i');
// "Entrega 23 de noviembre" (sin la palabra "fecha" y, a veces, sin año).
const RE_FECHA_CORTA = /\bentrega\s+(?:el\s+|para\s+el\s+)?(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/i;
// El número debe tener al menos un dígito: en "Orden de compra urgente" no hay número (no se inventa).
const RE_OC = /(?:orden\s+de\s+compra|purchase\s+order|\bO\.?C\.?|\bP\.?O\.?)\s*(?:n[°º.o]*|no\.?|#|number|num\.?)?\s*[:#-]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{2,})/i;
const RE_FECHA = /(?:fecha\s+(?:de\s+)?(?:entrega|despacho|requerida|requerimiento)|delivery\s+date|required\s+date|need\s+by)\s*[:=-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i;
// "Fecha despacho: 18 de Diciembre de 2026" (órdenes de compra en PDF).
const RE_FECHA_LETRAS = /fecha\s+(?:de\s+)?(?:entrega|despacho|requerida|requerimiento)\s*[:=-]?\s*(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// El encabezado explícito del documento manda sobre un "OC 4990" suelto del asunto o del cuerpo reenviado.
const RE_OC_ENCABEZADO = /orden\s+de\s+compra\s+(?:n[°º.o]*|nro?\.?|no\.?|num(?:ero)?\.?|#)\s*[:#-]?\s*(\d[A-Z0-9-]{2,})/i;
// "ORDEN DE COMPRA" y el número en la línea siguiente (PDF de compras).
const RE_OC_LINEA_SIGUIENTE = /orden\s+de\s+compra\s*\r?\n\s*(\d{3,}[A-Z0-9-]*)\s*(?:\r?\n|$)/i;
// DESPACHO / ENTREGA y una fecha ISO con barras en la misma línea o en la siguiente.
const RE_DESPACHO_ISO = /\b(?:despacho|entrega)\s*:?\s*\r?\n?\s*(\d{4})[/-](\d{2})[/-](\d{2})\b/i;
const RE_DIRECCION = /(?:direcci[oó]n\s+de\s+(?:entrega|despacho)|ship\s+to|deliver\s+to|entregar\s+en|lugar\s+de\s+entrega)\s*[:=-]\s*(.+)/i;
const RE_CLIENTE_FINAL = /(?:cliente\s+final|end\s+customer|final\s+customer|customer)\s*[:\-]\s*([^|/\n]+)/i;

export function extraerConReglas(
  texto: string,
  asunto: string,
  equivalencias: EquivalenciaRef[],
  opts: { clienteFinalEnAsunto?: boolean; peliculasConocidas?: string[]; hoy?: Date } = {},
): OcExtraccion {
  const notas: string[] = [];
  const todo = `${asunto}\n${texto}`;
  const campos: LineaCampos[] = [];
  const global = precioDeEncabezado(texto);
  for (const raw of unirCeldas(texto)) {
    // "2 mil kg" / "1,5 mil libras" → "2000 kg" / "1500 libras".
    const linea = raw
      .trim()
      .replace(/(\d+(?:[.,]\d+)?)\s*mil\s+(?=(?:kgs?|kilos?|kilogramos?|lbs?|libras?)\b)/gi, (_m, n: string) => `${Math.round((parseNumero(n.replace(',', '.')) ?? 0) * 1000)} `);
    if (!linea) continue;
    const peso = linea.match(RE_PESO);
    if (!peso) continue;
    const eq = buscarEquivalencia(linea, equivalencias);
    const antes = linea.slice(0, peso.index).replace(/^[\s\-*•\d.)|]+/, '').replace(/[|:,;\s-]+$/, '').trim();
    const ancho = linea.match(RE_ANCHO_ETIQUETA) ?? linea.match(RE_ANCHO_SUELTO);
    // Sin ancho con unidad: "SC 25 - 640" = película SC de 25 micras, ancho 640 mm.
    const codigoAncho = ancho ? null : linea.replace(peso[0], ' ').match(RE_CODIGO_ANCHO);
    const espesor = linea.match(RE_ESPESOR);
    // RE_PRECIO: 1 = moneda antes, 2 = valor, 3 = moneda después. RE_PRECIO_SIMBOLO: 1 = símbolo, 2 = valor.
    const precioEtiqueta = linea.match(RE_PRECIO);
    const precioSimbolo = precioEtiqueta ? null : linea.match(RE_PRECIO_SIMBOLO);
    const precioMoneda = precioEtiqueta || precioSimbolo ? null : linea.replace(peso[0], ' ').match(RE_PRECIO_MONEDA);
    const precioValor = precioEtiqueta?.[2] ?? precioSimbolo?.[2] ?? precioMoneda?.[2] ?? precioMoneda?.[3] ?? global.valor;
    // "$" solo es ambiguo (pesos o dólares): la moneda queda sin definir.
    const monedaRaw = precioEtiqueta
      ? (precioEtiqueta[1] ?? precioEtiqueta[3] ?? '')
      : precioSimbolo
        ? precioSimbolo[1]
        : precioMoneda
          ? (precioMoneda[1] ?? precioMoneda[4] ?? '')
          : (global.moneda ?? '');
    campos.push({
      textoCliente: linea,
      codigoCliente: eq?.clientCode ?? (codigoAncho ? codigoAncho[1].replace(/\s+/g, ' ').trim() : antes ? antes.slice(0, 80) : null),
      cantidad: parseNumero(peso[1]),
      unidad: peso[2],
      ancho: ancho ? parseNumero(ancho[1]) : codigoAncho ? parseNumero(codigoAncho[2]) : null,
      unidadAncho: ancho ? (ancho[2] ?? null) : codigoAncho ? 'mm' : null,
      espesor: espesor ? parseNumero(espesor[1]) : null,
      unidadEspesor: espesor ? espesor[2] : null,
      precioUnitario: precioValor ? parseNumero(precioValor) : null,
      moneda: /usd|us\$|u\$d|u\$s/i.test(monedaRaw) ? 'USD' : /cop/i.test(monedaRaw) ? 'COP' : null,
    });
  }
  if (campos.length === 0) notas.push('No se encontró ninguna línea con cantidad en kg/lb en el correo ni en los adjuntos legibles.');

  const fecha = todo.match(RE_FECHA);
  const despachoIso = fecha ? null : todo.match(RE_DESPACHO_ISO);
  const fechaLetras = fecha || despachoIso ? null : (todo.match(RE_FECHA_LETRAS) ?? todo.match(RE_FECHA_CORTA));
  const mesLetras = fechaLetras ? MESES.indexOf(fechaLetras[2].toLowerCase()) + 1 : 0;
  const fechaNorm = fecha
    ? normalizarFecha(fecha[1])
    : despachoIso
      ? `${despachoIso[1]}-${despachoIso[2]}-${despachoIso[3]}`
      : fechaLetras && mesLetras
      ? `${fechaLetras[3] ?? anioProbable(Number(fechaLetras[1]), mesLetras, opts.hoy ?? new Date())}-${String(mesLetras).padStart(2, '0')}-${fechaLetras[1].padStart(2, '0')}`
      : null;
  if (fecha && !fechaNorm) notas.push(`Fecha requerida "${fecha[1]}": formato día/mes ambiguo — confírmala.`);
  const clienteFinal = opts.clienteFinalEnAsunto ? (asunto.match(RE_CLIENTE_FINAL)?.[1]?.trim() ?? null) : null;

  return {
    // Primero el cuerpo ("Purchase Order #PO-7788"), luego el asunto.
    // Sin los rótulos "--- archivo.pdf ---": el nombre del adjunto ("OC93252-OBEN COLOMBIA") no es el número de la orden.
    numero: (() => {
      const limpio = texto.replace(/^---.*---\s*$/gm, '');
      return limpio.match(RE_OC_ENCABEZADO)?.[1] ?? limpio.match(RE_OC_LINEA_SIGUIENTE)?.[1] ?? limpio.match(RE_OC)?.[1] ?? asunto.match(RE_OC)?.[1] ?? null;
    })(),
    fechaRequerida: fechaNorm,
    direccionEntrega: texto.match(RE_DIRECCION)?.[1]?.trim().slice(0, 300) ?? null,
    clienteFinal,
    lineas: campos.map((c, i) => construirLinea(i + 1, c, equivalencias, opts.peliculasConocidas)),
    extraidoPor: 'reglas',
    notas,
  };
}

// ─── Extracción con IA (Ollama) ────────────────────────────────────────────

/**
 * La IA SOLO lee la orden de compra (qué pidió el cliente, cuánto, de qué
 * ancho). La referencia de Oben nunca sale de la IA: se traduce después con
 * la tabla de equivalencias, igual que en la extracción por reglas.
 */
export async function extraerConIa(
  cfg: OcIaConfig,
  input: {
    texto: string;
    asunto: string;
    equivalencias: EquivalenciaRef[];
    ejemplos: EjemploOc[];
    clienteFinalEnAsunto?: boolean;
    peliculasConocidas?: string[];
    /** Modelo alterno (OpenRouter) en vez del Ollama de `cfg`: recibe el prompt y devuelve el JSON como texto. */
    llm?: (prompt: string) => Promise<string>;
  },
): Promise<OcExtraccion> {
  const prompt = [
    'Eres un asistente de Customer Service de una fábrica de películas plásticas (BOPP, PET, etc.).',
    'Lee la orden de compra y devuelve SOLO un JSON con esta forma:',
    '{"numero": string|null, "fechaRequerida": "YYYY-MM-DD"|null, "direccionEntrega": string|null, "clienteFinal": string|null,',
    ' "lineas": [{"textoCliente": string, "codigoCliente": string|null, "cantidad": number|null, "unidad": "kg"|"lb"|"t"|null,',
    '   "ancho": number|null, "unidadAncho": "mm"|"cm"|"m"|"in"|null, "espesor": number|null, "unidadEspesor": "um"|"mil"|"g"|null,',
    '   "precioUnitario": number|null, "moneda": "USD"|"COP"|null}]}',
    'Reglas: no inventes datos — si algo no está en la orden, usa null. "codigoCliente" es el nombre o código con que el cliente pide el material, copiado tal cual.',
    'Si la tabla trae un código interno del ítem (p. ej. "02720") Y una descripción del material (p. ej. "BOPP-SC 17 MICRAS TRANSP."), "codigoCliente" es la DESCRIPCIÓN del material, nunca el código del ítem.',
    'Si la columna de ancho no trae unidad: los valores menores a 200 son centímetros ("unidadAncho":"cm") y los de 200 o más son milímetros ("mm"). Nunca dejes un ancho sin unidad.',
    input.clienteFinalEnAsunto ? 'Este cliente es intermediario: el cliente final viene en el asunto.' : '',
    input.equivalencias.length
      ? `Nombres que este cliente suele usar: ${input.equivalencias.map((e) => JSON.stringify(e.clientCode)).join(', ')}.`
      : '',
    ...input.ejemplos.slice(0, 5).map((e, i) => `Ejemplo ${i + 1} — orden:\n${e.entrada}\nJSON:\n${JSON.stringify(e.salida)}`),
    `Asunto: ${input.asunto}`,
    `Orden de compra:\n${input.texto.slice(0, 12_000)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 60_000);
  let raw: string;
  try {
    if (input.llm) {
      raw = await input.llm(prompt);
    } else {
      const res = await fetch(`${cfg.host.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, prompt, format: 'json', stream: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      raw = ((await res.json()) as { response?: string }).response ?? '';
    }
  } finally {
    clearTimeout(timeout);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')) as Record<string, unknown>;
  } catch {
    throw new Error('la IA no devolvió un JSON válido');
  }
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : typeof v === 'string' ? parseNumero(v) : null);
  const lineasRaw = Array.isArray(parsed.lineas) ? parsed.lineas : [];
  const campos: LineaCampos[] = lineasRaw.map((l) => {
    const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
    return {
      textoCliente: txt(o.textoCliente) ?? txt(o.codigoCliente) ?? '(línea sin texto)',
      codigoCliente: txt(o.codigoCliente),
      cantidad: numOrNull(o.cantidad),
      // Unidad dañada por el OCR ("Kão(s)"): si el documento habla de kilos, es kg.
      unidad: txt(o.unidad) ?? (/\bkilos?\b|\bkgs?\b|\bk.{1,2}\(s\)/i.test(input.texto) ? 'kg' : null),
      ancho: numOrNull(o.ancho),
      unidadAncho: txt(o.unidadAncho),
      espesor: numOrNull(o.espesor),
      unidadEspesor: txt(o.unidadEspesor),
      precioUnitario: numOrNull(o.precioUnitario),
      moneda: txt(o.moneda),
    };
  });
  const fecha = txt(parsed.fechaRequerida);
  return {
    numero: txt(parsed.numero),
    fechaRequerida: fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
    direccionEntrega: txt(parsed.direccionEntrega),
    clienteFinal: txt(parsed.clienteFinal),
    lineas: campos.map((c, i) => construirLinea(i + 1, c, input.equivalencias, input.peliculasConocidas)),
    extraidoPor: 'ia',
    notas: campos.length === 0 ? ['La IA no encontró líneas de producto en la orden de compra.'] : [],
  };
}

// ─── Traducción de una línea (común a reglas e IA) ─────────────────────────

export function construirLinea(n: number, c: LineaCampos, equivalencias: EquivalenciaRef[], peliculasConocidas: string[] = []): CasoLinea {
  const conversiones: string[] = [];
  const faltantes: string[] = [];
  const eqTabla =
    (c.codigoCliente ? buscarEquivalencia(c.codigoCliente, equivalencias, true) : null) ??
    buscarEquivalencia(c.textoCliente, equivalencias);
  // Sin equivalencia: la película se infiere de "SC 25" (letras + espesor) si en Oben existe una sola así.
  const inferida = eqTabla ? null : (inferirPelicula(c.codigoCliente ?? '', peliculasConocidas) ?? inferirPelicula(c.textoCliente, peliculasConocidas));
  const eq: EquivalenciaRef | null = eqTabla ?? (inferida ? { id: '', clientCode: c.codigoCliente ?? c.textoCliente.slice(0, 60), obenCode: inferida } : null);

  let kilos: number | null = null;
  // Las películas de Oben se piden por peso: si la línea ya quedó con una referencia de película y la unidad falta o el OCR la dañó
  // ("Kão(s)", "K1lo(s)"), la unidad es kg. Una unidad que no empieza por K (m, und, lb…) no se toca.
  const up = (c.unidad ? unidadPeso(c.unidad) : null) ?? (eq && (!c.unidad || /^k/i.test(c.unidad.trim())) ? 'kg' : null);
  if (c.cantidad && up) {
    const r = aKilos(c.cantidad, up);
    kilos = r.kilos;
    if (r.nota) conversiones.push(r.nota);
  } else {
    faltantes.push('cantidad en kg o lb');
  }

  let anchoMm: number | null = null;
  // Ancho sin unidad (columna "ANCHO" de una tabla): menos de 200 se toma como cm (ningún rollo mide 200 cm); de 200 en adelante NO se adivina.
  const unidadAncho = c.unidadAncho ?? (c.ancho && c.ancho < 200 ? 'cm' : null);
  const ul = unidadAncho ? unidadLongitud(unidadAncho) : null;
  if (c.ancho && ul) {
    const r = aMilimetros(c.ancho, ul);
    anchoMm = r.mm;
    if (r.nota) conversiones.push(r.nota);
  } else {
    faltantes.push(c.ancho ? `unidad del ancho (${c.ancho})` : 'ancho');
  }

  let espesorMicras: number | null = null;
  const ue = c.unidadEspesor ? unidadEspesor(c.unidadEspesor) : null;
  if (c.espesor && ue) {
    const r = aMicras(c.espesor, ue);
    espesorMicras = r.micras;
    if (r.nota) conversiones.push(r.nota);
  }

  if (!eq) {
    faltantes.unshift(
      `sin equivalencia para "${c.codigoCliente ?? c.textoCliente.slice(0, 60)}" — agrégala en Equivalencias o corrige la línea`,
    );
  }

  return {
    n,
    textoCliente: c.textoCliente,
    codigoCliente: eq?.clientCode ?? c.codigoCliente ?? null,
    codigoOben: eq?.obenCode ?? null,
    equivalenciaId: eq?.id || null,
    cantidad: c.cantidad ?? null,
    unidad: c.unidad ?? null,
    kilos,
    anchoMm,
    espesorMicras,
    precioUnitario: c.precioUnitario ?? null,
    moneda: c.moneda ?? null,
    conversiones,
    faltantes,
  };
}

/** Normaliza para comparar: minúsculas, sin tildes, solo letras/dígitos separados por un espacio. */
export function normTexto(s: string): string {
  return ` ${s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/**
 * Equivalencia cuyo código de cliente aparece COMPLETO en el texto (palabra
 * entera). Si varias coinciden gana la más larga ("BOPP 345" antes que "BOPP 3").
 * `exacta` = el texto debe ser exactamente el código.
 */
export function buscarEquivalencia(texto: string, equivalencias: EquivalenciaRef[], exacta = false): EquivalenciaRef | null {
  const t = normTexto(texto);
  let best: EquivalenciaRef | null = null;
  let bestLen = 0;
  for (const e of equivalencias) {
    const code = normTexto(e.clientCode);
    if (code.trim().length === 0) continue;
    const ok = exacta ? t === code : t.includes(code);
    if (ok && code.length > bestLen) {
      best = e;
      bestLen = code.length;
    }
  }
  return best;
}

/**
 * Las tablas de correo llegan con cada celda en su propia línea ("SC 25 - 640" y luego "7.500 KILOS"): si una línea no trae
 * cantidad y la siguiente es solo una cantidad, van juntas como una sola línea de producto.
 */
export function unirCeldas(texto: string): string[] {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\t+/g, ' | ').trim())
    .filter(Boolean);
  const soloPeso = new RegExp(`^${NUM}${SEP}(kgs?|kilos?|kilogramos?|lbs?|libras?|toneladas?|tons?)\\s*$`, 'i');
  const out: string[] = [];
  for (let i = 0; i < lineas.length; i++) {
    if (!RE_PESO.test(lineas[i]) && i + 1 < lineas.length && soloPeso.test(lineas[i + 1])) {
      out.push(`${lineas[i]} | ${lineas[i + 1]}`);
      i++;
    } else out.push(lineas[i]);
  }
  return out;
}

/** El precio que va en una línea suelta del encabezado ("U$D 2,50"): vale para todas las líneas si es uno solo. */
export function precioDeEncabezado(texto: string): { valor: string | null; moneda: string | null } {
  const vistos = new Map<string, string>();
  for (const l of texto.split(/\r?\n/)) {
    if (!l.trim() || RE_PESO.test(l)) continue;
    const m = l.match(RE_PRECIO) ?? l.match(RE_PRECIO_SIMBOLO) ?? l.match(RE_PRECIO_MONEDA);
    if (!m) continue;
    const grupos = m.slice(1).filter(Boolean) as string[];
    const valor = grupos.find((g) => /^\d/.test(g));
    const moneda = grupos.find((g) => /^(usd|cop|u\$d|u\$s|us\$|\$)$/i.test(g)) ?? '';
    if (valor && parseNumero(valor)) vistos.set(String(parseNumero(valor)), `${valor}|${moneda}`);
  }
  if (vistos.size !== 1) return { valor: null, moneda: null };
  const [valor, moneda] = [...vistos.values()][0].split('|');
  return { valor, moneda: moneda || null };
}

/** Año de una fecha sin año ("23 de noviembre"): el de hoy, o el siguiente si ya pasó hace más de un mes. */
function anioProbable(dia: number, mes: number, hoy: Date): number {
  const anio = hoy.getUTCFullYear();
  const f = Date.UTC(anio, mes - 1, dia);
  return f < hoy.getTime() - 31 * 24 * 3600 * 1000 ? anio + 1 : anio;
}

/**
 * "SC 25" → "SC---0025TN" si entre las referencias que Oben ya maneja hay UNA sola película con esas letras y ese
 * espesor. Si hay varias o ninguna no se adivina (queda como faltante).
 */
export function inferirPelicula(texto: string, peliculas: string[]): string | null {
  if (!texto || peliculas.length === 0) return null;
  const encontrados = new Set<string>();
  // Código compacto "ET12TA": letras + espesor + sufijo, tal cual está en el catálogo ("ET---0012TA").
  for (const m of texto.matchAll(/\b([A-Za-z]{1,4})(\d{2,3})([A-Za-z]{2})\b/g)) {
    const [letras, espesor, sufijo] = [m[1].toUpperCase(), Number(m[2]), m[3].toUpperCase()];
    for (const p of peliculas) {
      const k = p.toUpperCase().replace(/-/g, '').match(/^([A-Z]+)(\d{4})([A-Z]{2})$/);
      if (k && k[1] === letras && Number(k[2]) === espesor && k[3] === sufijo) encontrados.add(p.toUpperCase());
    }
  }
  if (encontrados.size === 1) return [...encontrados][0];
  for (const m of texto.matchAll(/\b([A-Za-z]{1,4})\s*[-.]?\s*(\d{2,3})\b/g)) {
    const letras = m[1].toUpperCase();
    const espesor = Number(m[2]);
    for (const p of peliculas) {
      const k = p.toUpperCase().replace(/-/g, '').match(/^([A-Z]+)(\d{4})([A-Z]{2})$/);
      if (k && k[1] === letras && Number(k[2]) === espesor) encontrados.add(p.toUpperCase());
    }
  }
  if (encontrados.size === 1) return [...encontrados][0];
  // Varias del mismo espesor ("ML---0015MN" y "ML---0015MS"): el texto desempata si dice transparente o metalizado.
  if (encontrados.size > 1) {
    const inicial = /transp/i.test(texto) ? 'T' : /metaliz/i.test(texto) ? 'M' : null;
    if (inicial) {
      const filtradas = [...encontrados].filter((p) => p.replace(/-/g, '').match(/^[A-Z]+\d{4}([A-Z])[A-Z]$/)?.[1] === inicial);
      if (filtradas.length === 1) return filtradas[0];
    }
  }
  return null;
}

function normalizarFecha(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  // Día/mes solo es inequívoco si uno de los dos pasa de 12.
  let d: number;
  let mo: number;
  if (a > 12 && b <= 12) [d, mo] = [a, b];
  else if (b > 12 && a <= 12) [d, mo] = [b, a];
  else if (a === b) [d, mo] = [a, b];
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
