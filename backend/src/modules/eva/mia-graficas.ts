import { MARCA, PALETA_GRAFICAS } from './mia-marca';

/**
 * Gráficas de MIA (Hernán, 23-oct: "MIA me dice que no puede hacer un PDF con gráficas"). Se dibujan como SVG con la
 * paleta de Oben Group: el PDF las inserta como vector (nítidas a cualquier zoom) y Word/Excel como imagen PNG.
 * Sin dependencias del sistema: SVG a mano, PNG con resvg.
 */
export type TipoGrafica = 'barras' | 'barras_horizontales' | 'lineas' | 'area' | 'torta' | 'dona';

export interface MiaGrafica {
  titulo: string;
  tipo: TipoGrafica;
  /** Etiquetas del eje X (o de cada porción en torta/dona). */
  categorias: string[];
  /** Una o varias series; en torta/dona se usa la primera. */
  series: Array<{ nombre: string; valores: number[] }>;
  /** Texto del eje de valores, p. ej. "USD" o "kg". */
  unidad?: string;
}

export const ANCHO_GRAFICA = 720;
export const ALTO_GRAFICA = 380;

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const corto = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** 12345.6 → "12.346"; 0.5 → "0,5"; 1250000 → "1,25 M". */
export function numeroCorto(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} M`;
  if (a >= 10_000) return Math.round(n).toLocaleString('es-CO');
  return n.toLocaleString('es-CO', { maximumFractionDigits: a < 10 ? 2 : 0 });
}

/** Escala "redonda" para el eje: 0 … tope con 4–6 divisiones. */
function escala(max: number): { tope: number; paso: number } {
  if (!(max > 0)) return { tope: 1, paso: 0.25 };
  const bruto = max / 5;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? 10 * pot;
  return { tope: Math.ceil(max / paso) * paso, paso };
}

/** Normaliza lo que manda el modelo: sin NaN, series del largo de las categorías, como máximo 8 series y 40 categorías. */
export function normalizarGrafica(g: MiaGrafica): MiaGrafica {
  const categorias = (g.categorias ?? []).slice(0, 40).map((c) => String(c));
  const series = (g.series ?? []).slice(0, 8).map((s) => ({
    nombre: String(s?.nombre ?? ''),
    valores: categorias.map((_, i) => {
      const v = Number(s?.valores?.[i]);
      return Number.isFinite(v) ? v : 0;
    }),
  }));
  const tipos: TipoGrafica[] = ['barras', 'barras_horizontales', 'lineas', 'area', 'torta', 'dona'];
  return { titulo: String(g.titulo ?? ''), tipo: tipos.includes(g.tipo) ? g.tipo : 'barras', categorias, series, unidad: g.unidad ? String(g.unidad) : undefined };
}

export function graficaSvg(entrada: MiaGrafica): string {
  const g = normalizarGrafica(entrada);
  const W = ANCHO_GRAFICA;
  const H = ALTO_GRAFICA;
  const partes: string[] = [];
  partes.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${MARCA.blanco}"/>`);
  partes.push(`<text x="20" y="30" font-family="Helvetica, Nunito, Arial, sans-serif" font-size="16" font-weight="bold" fill="${MARCA.negro}">${esc(corto(g.titulo, 70))}</text>`);
  partes.push(`<rect x="20" y="38" width="36" height="3" fill="${MARCA.naranja}"/>`);

  if (g.tipo === 'torta' || g.tipo === 'dona') partes.push(...torta(g, W, H));
  else partes.push(...ejes(g, W, H));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${partes.join('')}</svg>`;
}

function leyenda(series: Array<{ nombre: string }>, x: number, y: number): string[] {
  const out: string[] = [];
  let cx = x;
  series.forEach((s, i) => {
    if (!s.nombre) return;
    out.push(`<rect x="${cx}" y="${y - 9}" width="10" height="10" rx="2" fill="${PALETA_GRAFICAS[i % PALETA_GRAFICAS.length]}"/>`);
    out.push(`<text x="${cx + 14}" y="${y}" font-family="Helvetica, Nunito, Arial, sans-serif" font-size="11" fill="${MARCA.grafito}">${esc(corto(s.nombre, 24))}</text>`);
    cx += 24 + Math.min(s.nombre.length, 24) * 6.2;
  });
  return out;
}

function ejes(g: MiaGrafica, W: number, H: number): string[] {
  const out: string[] = [];
  const horizontal = g.tipo === 'barras_horizontales';
  const multiples = g.series.length > 1;
  const top = multiples ? 76 : 60;
  if (multiples) out.push(...leyenda(g.series, 20, 62));
  const valores = g.series.flatMap((s) => s.valores);
  const max = Math.max(0, ...valores);
  const { tope, paso } = escala(max);
  const font = 'font-family="Helvetica, Nunito, Arial, sans-serif"';

  if (horizontal) {
    const left = 170;
    const right = W - 30;
    const bottom = H - 34;
    const n = Math.max(g.categorias.length, 1);
    const banda = (bottom - top) / n;
    for (let v = 0; v <= tope + 1e-9; v += paso) {
      const x = left + (v / tope) * (right - left);
      out.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${MARCA.grisClaro}" stroke-width="1"/>`);
      out.push(`<text x="${x}" y="${bottom + 16}" text-anchor="middle" ${font} font-size="10" fill="${MARCA.grafito}">${esc(numeroCorto(v))}</text>`);
    }
    const alto = Math.min(26, (banda * 0.7) / g.series.length);
    g.categorias.forEach((c, i) => {
      const y0 = top + i * banda + (banda - alto * g.series.length) / 2;
      out.push(`<text x="${left - 8}" y="${top + i * banda + banda / 2 + 4}" text-anchor="end" ${font} font-size="11" fill="${MARCA.negro}">${esc(corto(c, 26))}</text>`);
      g.series.forEach((s, j) => {
        const w = (s.valores[i] / tope) * (right - left);
        const y = y0 + j * alto;
        out.push(`<rect x="${left}" y="${y}" width="${Math.max(w, 0)}" height="${alto - 2}" rx="3" fill="${PALETA_GRAFICAS[j % PALETA_GRAFICAS.length]}"/>`);
        if (g.categorias.length <= 15) out.push(`<text x="${left + Math.max(w, 0) + 4}" y="${y + alto / 2 + 3}" ${font} font-size="10" fill="${MARCA.grafito}">${esc(numeroCorto(s.valores[i]))}</text>`);
      });
    });
    out.push(`<line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="${MARCA.gris}" stroke-width="1"/>`);
    return out;
  }

  const left = 64;
  const right = W - 24;
  const bottom = H - 56;
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    const y = bottom - (v / tope) * (bottom - top);
    out.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${MARCA.grisClaro}" stroke-width="1"/>`);
    out.push(`<text x="${left - 6}" y="${y + 3}" text-anchor="end" ${font} font-size="10" fill="${MARCA.grafito}">${esc(numeroCorto(v))}</text>`);
  }
  if (g.unidad) out.push(`<text x="14" y="${(top + bottom) / 2}" transform="rotate(-90 14 ${(top + bottom) / 2})" text-anchor="middle" ${font} font-size="10" fill="${MARCA.grafito}">${esc(g.unidad)}</text>`);
  const n = Math.max(g.categorias.length, 1);
  const banda = (right - left) / n;
  const rotar = n > 8;
  g.categorias.forEach((c, i) => {
    const x = left + i * banda + banda / 2;
    out.push(
      rotar
        ? `<text x="${x}" y="${bottom + 12}" transform="rotate(-35 ${x} ${bottom + 12})" text-anchor="end" ${font} font-size="10" fill="${MARCA.negro}">${esc(corto(c, 16))}</text>`
        : `<text x="${x}" y="${bottom + 16}" text-anchor="middle" ${font} font-size="11" fill="${MARCA.negro}">${esc(corto(c, 14))}</text>`,
    );
  });
  const yDe = (v: number) => bottom - (Math.max(v, 0) / tope) * (bottom - top);

  if (g.tipo === 'barras') {
    const ancho = Math.min(46, (banda * 0.72) / g.series.length);
    g.series.forEach((s, j) => {
      s.valores.forEach((v, i) => {
        const x = left + i * banda + (banda - ancho * g.series.length) / 2 + j * ancho;
        const y = yDe(v);
        out.push(`<rect x="${x}" y="${y}" width="${ancho - 3}" height="${bottom - y}" rx="3" fill="${PALETA_GRAFICAS[j % PALETA_GRAFICAS.length]}"/>`);
        if (n * g.series.length <= 16) out.push(`<text x="${x + (ancho - 3) / 2}" y="${y - 5}" text-anchor="middle" ${font} font-size="10" fill="${MARCA.grafito}">${esc(numeroCorto(v))}</text>`);
      });
    });
  } else {
    g.series.forEach((s, j) => {
      const color = PALETA_GRAFICAS[j % PALETA_GRAFICAS.length];
      const puntos = s.valores.map((v, i) => [left + i * banda + banda / 2, yDe(v)] as const);
      const linea = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      if (g.tipo === 'area' && puntos.length) {
        const area = `${linea} L${puntos[puntos.length - 1][0].toFixed(1)},${bottom} L${puntos[0][0].toFixed(1)},${bottom} Z`;
        out.push(`<path d="${area}" fill="${color}" fill-opacity="0.18"/>`);
      }
      out.push(`<path d="${linea}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`);
      puntos.forEach(([x, y], i) => {
        out.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="${MARCA.blanco}" stroke="${color}" stroke-width="2"/>`);
        if (n <= 12 && g.series.length === 1) out.push(`<text x="${x}" y="${y - 8}" text-anchor="middle" ${font} font-size="10" fill="${MARCA.grafito}">${esc(numeroCorto(s.valores[i]))}</text>`);
      });
    });
  }
  out.push(`<line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="${MARCA.gris}" stroke-width="1"/>`);
  return out;
}

function torta(g: MiaGrafica, W: number, H: number): string[] {
  const out: string[] = [];
  const valores = (g.series[0]?.valores ?? []).map((v) => Math.max(v, 0));
  const total = valores.reduce((a, b) => a + b, 0);
  const cx = 200;
  const cy = (H + 40) / 2;
  const r = Math.min(130, (H - 80) / 2);
  const font = 'font-family="Helvetica, Nunito, Arial, sans-serif"';
  if (!(total > 0)) {
    out.push(`<text x="${W / 2}" y="${H / 2}" text-anchor="middle" ${font} font-size="13" fill="${MARCA.grafito}">Sin datos para graficar</text>`);
    return out;
  }
  let ang = -Math.PI / 2;
  valores.forEach((v, i) => {
    const frac = v / total;
    if (frac <= 0) return;
    const fin = ang + frac * 2 * Math.PI;
    const color = PALETA_GRAFICAS[i % PALETA_GRAFICAS.length];
    if (frac >= 0.9999) out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`);
    else {
      const [x1, y1] = [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
      const [x2, y2] = [cx + r * Math.cos(fin), cy + r * Math.sin(fin)];
      out.push(`<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${color}" stroke="${MARCA.blanco}" stroke-width="2"/>`);
    }
    ang = fin;
  });
  if (g.tipo === 'dona') {
    out.push(`<circle cx="${cx}" cy="${cy}" r="${r * 0.58}" fill="${MARCA.blanco}"/>`);
    out.push(`<text x="${cx}" y="${cy - 2}" text-anchor="middle" ${font} font-size="20" font-weight="bold" fill="${MARCA.negro}">${esc(numeroCorto(total))}</text>`);
    out.push(`<text x="${cx}" y="${cy + 16}" text-anchor="middle" ${font} font-size="11" fill="${MARCA.grafito}">${esc(g.unidad ?? 'Total')}</text>`);
  }
  const x = 380;
  const filas = Math.min(g.categorias.length, 12);
  const y0 = cy - (filas * 22) / 2 + 8;
  g.categorias.slice(0, 12).forEach((c, i) => {
    const y = y0 + i * 22;
    const pct = ((valores[i] ?? 0) / total) * 100;
    out.push(`<rect x="${x}" y="${y - 10}" width="12" height="12" rx="2" fill="${PALETA_GRAFICAS[i % PALETA_GRAFICAS.length]}"/>`);
    out.push(`<text x="${x + 20}" y="${y}" ${font} font-size="12" fill="${MARCA.negro}">${esc(corto(c, 26))}</text>`);
    out.push(`<text x="${W - 34}" y="${y}" text-anchor="end" ${font} font-size="12" font-weight="bold" fill="${MARCA.grafito}">${pct.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %</text>`);
  });
  return out;
}
