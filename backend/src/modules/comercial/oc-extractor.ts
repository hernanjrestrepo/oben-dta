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

// ─── Texto de los adjuntos ─────────────────────────────────────────────────

/** Texto legible de los adjuntos: PDF con texto, Excel y CSV/TXT. Imágenes y PDF escaneados NO (quedan "no leído"). */
export async function textoDeAdjuntos(
  adjuntos: OcAdjunto[],
): Promise<{ texto: string; resumen: Array<{ filename: string; contentType: string | null; bytes: number; leido: boolean }>; notas: string[] }> {
  const partes: string[] = [];
  const notas: string[] = [];
  const resumen: Array<{ filename: string; contentType: string | null; bytes: number; leido: boolean }> = [];
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
    const leido = !!texto && texto.trim().length > 0;
    if (leido) partes.push(`--- ${name} ---\n${texto}`);
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
const RE_ANCHO_SUELTO = new RegExp(`${NUM}${SEP}(mm|cm|pulgadas|pulg|in|inch(?:es)?|")(?![a-z])`, 'i');
// "2 mil kg" es "dos mil kilos", no 2 mils de espesor.
const RE_ESPESOR = new RegExp(`${NUM}${SEP}(µm|μm|um|micras?|micrones|mic|mils?|g/m2|g/m²|gsm|grs?|g)(?![a-z])(?!\\s*(?:kg|kilos?|lbs?|libras?)\\b)`, 'i');
const RE_PRECIO = new RegExp(`(?:precio(?:\\s+unitario)?|price|unit\\s+price|valor\\s+unitario|p\\.?\\s*unit\\.?)\\s*[:=]?\\s*(usd|us\\$|cop|\\$)?\\s*${NUM}\\s*(usd|cop)?`, 'i');
const RE_PRECIO_SIMBOLO = new RegExp(`(us\\$|\\$)\\s*${NUM}`, 'i');
// El número debe tener al menos un dígito: en "Orden de compra urgente" no hay número (no se inventa).
const RE_OC = /(?:orden\s+de\s+compra|purchase\s+order|\bO\.?C\.?|\bP\.?O\.?)\s*(?:n[°º.o]*|no\.?|#|number|num\.?)?\s*[:#-]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{2,})/i;
const RE_FECHA = /(?:fecha\s+(?:de\s+)?(?:entrega|requerida|requerimiento)|delivery\s+date|required\s+date|need\s+by)\s*[:=-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i;
const RE_DIRECCION = /(?:direcci[oó]n\s+de\s+(?:entrega|despacho)|ship\s+to|deliver\s+to|entregar\s+en|lugar\s+de\s+entrega)\s*[:=-]\s*(.+)/i;
const RE_CLIENTE_FINAL = /(?:cliente\s+final|end\s+customer|final\s+customer|customer)\s*[:\-]\s*([^|/\n]+)/i;

export function extraerConReglas(
  texto: string,
  asunto: string,
  equivalencias: EquivalenciaRef[],
  opts: { clienteFinalEnAsunto?: boolean } = {},
): OcExtraccion {
  const notas: string[] = [];
  const todo = `${asunto}\n${texto}`;
  const campos: LineaCampos[] = [];
  for (const raw of texto.split(/\r?\n/)) {
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
    const espesor = linea.match(RE_ESPESOR);
    // RE_PRECIO: 1 = moneda antes, 2 = valor, 3 = moneda después. RE_PRECIO_SIMBOLO: 1 = símbolo, 2 = valor.
    const precioEtiqueta = linea.match(RE_PRECIO);
    const precioSimbolo = precioEtiqueta ? null : linea.match(RE_PRECIO_SIMBOLO);
    const precioValor = precioEtiqueta?.[2] ?? precioSimbolo?.[2] ?? null;
    // "$" solo es ambiguo (pesos o dólares): la moneda queda sin definir.
    const monedaRaw = precioEtiqueta ? (precioEtiqueta[1] ?? precioEtiqueta[3] ?? '') : (precioSimbolo?.[1] ?? '');
    campos.push({
      textoCliente: linea,
      codigoCliente: eq?.clientCode ?? (antes ? antes.slice(0, 80) : null),
      cantidad: parseNumero(peso[1]),
      unidad: peso[2],
      ancho: ancho ? parseNumero(ancho[1]) : null,
      unidadAncho: ancho ? (ancho[2] ?? null) : null,
      espesor: espesor ? parseNumero(espesor[1]) : null,
      unidadEspesor: espesor ? espesor[2] : null,
      precioUnitario: precioValor ? parseNumero(precioValor) : null,
      moneda: /usd|us\$/i.test(monedaRaw) ? 'USD' : /cop/i.test(monedaRaw) ? 'COP' : null,
    });
  }
  if (campos.length === 0) notas.push('No se encontró ninguna línea con cantidad en kg/lb en el correo ni en los adjuntos legibles.');

  const fecha = todo.match(RE_FECHA);
  const fechaNorm = fecha ? normalizarFecha(fecha[1]) : null;
  if (fecha && !fechaNorm) notas.push(`Fecha requerida "${fecha[1]}": formato día/mes ambiguo — confírmala.`);
  const clienteFinal = opts.clienteFinalEnAsunto ? (asunto.match(RE_CLIENTE_FINAL)?.[1]?.trim() ?? null) : null;

  return {
    // Primero el cuerpo ("Purchase Order #PO-7788"), luego el asunto.
    numero: texto.match(RE_OC)?.[1] ?? asunto.match(RE_OC)?.[1] ?? null,
    fechaRequerida: fechaNorm,
    direccionEntrega: texto.match(RE_DIRECCION)?.[1]?.trim().slice(0, 300) ?? null,
    clienteFinal,
    lineas: campos.map((c, i) => construirLinea(i + 1, c, equivalencias)),
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
  input: { texto: string; asunto: string; equivalencias: EquivalenciaRef[]; ejemplos: EjemploOc[]; clienteFinalEnAsunto?: boolean },
): Promise<OcExtraccion> {
  const prompt = [
    'Eres un asistente de Customer Service de una fábrica de películas plásticas (BOPP, PET, etc.).',
    'Lee la orden de compra y devuelve SOLO un JSON con esta forma:',
    '{"numero": string|null, "fechaRequerida": "YYYY-MM-DD"|null, "direccionEntrega": string|null, "clienteFinal": string|null,',
    ' "lineas": [{"textoCliente": string, "codigoCliente": string|null, "cantidad": number|null, "unidad": "kg"|"lb"|"t"|null,',
    '   "ancho": number|null, "unidadAncho": "mm"|"cm"|"m"|"in"|null, "espesor": number|null, "unidadEspesor": "um"|"mil"|"g"|null,',
    '   "precioUnitario": number|null, "moneda": "USD"|"COP"|null}]}',
    'Reglas: no inventes datos — si algo no está en la orden, usa null. "codigoCliente" es el nombre o código con que el cliente pide el material, copiado tal cual.',
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
    const res = await fetch(`${cfg.host.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, prompt, format: 'json', stream: false }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    raw = ((await res.json()) as { response?: string }).response ?? '';
  } finally {
    clearTimeout(timeout);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
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
      unidad: txt(o.unidad),
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
    lineas: campos.map((c, i) => construirLinea(i + 1, c, input.equivalencias)),
    extraidoPor: 'ia',
    notas: campos.length === 0 ? ['La IA no encontró líneas de producto en la orden de compra.'] : [],
  };
}

// ─── Traducción de una línea (común a reglas e IA) ─────────────────────────

export function construirLinea(n: number, c: LineaCampos, equivalencias: EquivalenciaRef[]): CasoLinea {
  const conversiones: string[] = [];
  const faltantes: string[] = [];
  const eq =
    (c.codigoCliente ? buscarEquivalencia(c.codigoCliente, equivalencias, true) : null) ??
    buscarEquivalencia(c.textoCliente, equivalencias);

  let kilos: number | null = null;
  const up = c.unidad ? unidadPeso(c.unidad) : null;
  if (c.cantidad && up) {
    const r = aKilos(c.cantidad, up);
    kilos = r.kilos;
    if (r.nota) conversiones.push(r.nota);
  } else {
    faltantes.push('cantidad en kg o lb');
  }

  let anchoMm: number | null = null;
  const ul = c.unidadAncho ? unidadLongitud(c.unidadAncho) : null;
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
    equivalenciaId: eq?.id ?? null,
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
