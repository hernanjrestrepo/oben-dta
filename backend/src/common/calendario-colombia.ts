/**
 * Calendario de festivos de Colombia (Ley 51 de 1983, "Ley Emiliani") y días hábiles.
 * Solo se despacha de lunes a viernes: se descartan sábados, domingos y festivos (Hernán / Alejandra, 4-nov-2026).
 * Las fechas van como texto AAAA-MM-DD; todo el cálculo es en UTC para que la zona horaria no mueva el día.
 */

export interface Festivo {
  fecha: string;
  nombre: string;
}

const DIA_MS = 24 * 3600 * 1000;

const aFecha = (d: Date) => d.toISOString().slice(0, 10);
const deTexto = (f: string) => new Date(`${f}T00:00:00Z`);
const sumar = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA_MS);

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
function pascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/** Ley Emiliani: si no cae lunes, pasa al lunes siguiente. */
function aLunes(d: Date): Date {
  const dow = d.getUTCDay(); // 0 domingo … 6 sábado
  return dow === 1 ? d : sumar(d, (8 - dow) % 7);
}

const cache = new Map<number, Festivo[]>();

/** Los festivos del año, en orden. */
export function festivosDe(anio: number): Festivo[] {
  const hit = cache.get(anio);
  if (hit) return hit;
  const fijo = (mes: number, dia: number) => new Date(Date.UTC(anio, mes - 1, dia));
  const p = pascua(anio);
  const lista: Festivo[] = [
    { fecha: aFecha(fijo(1, 1)), nombre: 'Año Nuevo' },
    { fecha: aFecha(aLunes(fijo(1, 6))), nombre: 'Reyes Magos' },
    { fecha: aFecha(aLunes(fijo(3, 19))), nombre: 'San José' },
    { fecha: aFecha(sumar(p, -3)), nombre: 'Jueves Santo' },
    { fecha: aFecha(sumar(p, -2)), nombre: 'Viernes Santo' },
    { fecha: aFecha(fijo(5, 1)), nombre: 'Día del Trabajo' },
    { fecha: aFecha(aLunes(sumar(p, 39))), nombre: 'Ascensión del Señor' },
    { fecha: aFecha(aLunes(sumar(p, 60))), nombre: 'Corpus Christi' },
    { fecha: aFecha(aLunes(sumar(p, 68))), nombre: 'Sagrado Corazón' },
    { fecha: aFecha(aLunes(fijo(6, 29))), nombre: 'San Pedro y San Pablo' },
    { fecha: aFecha(fijo(7, 20)), nombre: 'Independencia de Colombia' },
    { fecha: aFecha(fijo(8, 7)), nombre: 'Batalla de Boyacá' },
    { fecha: aFecha(aLunes(fijo(8, 15))), nombre: 'Asunción de la Virgen' },
    { fecha: aFecha(aLunes(fijo(10, 12))), nombre: 'Día de la Raza' },
    { fecha: aFecha(aLunes(fijo(11, 1))), nombre: 'Todos los Santos' },
    { fecha: aFecha(aLunes(fijo(11, 11))), nombre: 'Independencia de Cartagena' },
    { fecha: aFecha(fijo(12, 8)), nombre: 'Inmaculada Concepción' },
    { fecha: aFecha(fijo(12, 25)), nombre: 'Navidad' },
  ].sort((x, y) => x.fecha.localeCompare(y.fecha));
  cache.set(anio, lista);
  return lista;
}

export function esFestivo(fecha: string): boolean {
  const anio = Number(fecha.slice(0, 4));
  return festivosDe(anio).some((f) => f.fecha === fecha);
}

/** Lunes a viernes que no sea festivo. */
export function esHabil(fecha: string): boolean {
  const dow = deTexto(fecha).getUTCDay();
  return dow !== 0 && dow !== 6 && !esFestivo(fecha);
}

/** El día hábil anterior o igual a la fecha. */
export function habilAnteriorOIgual(fecha: string): string {
  let d = deTexto(fecha);
  while (!esHabil(aFecha(d))) d = sumar(d, -1);
  return aFecha(d);
}

/**
 * Resta `dias` días HÁBILES a la fecha (solo cuentan lunes a viernes sin festivos). El resultado siempre es un día
 * hábil: si la fecha de partida no lo es, primero se baja al hábil anterior. Con 0 días devuelve ese hábil.
 */
export function restarDiasHabiles(fecha: string, dias: number): string {
  let d = deTexto(habilAnteriorOIgual(fecha));
  let faltan = Math.max(0, Math.floor(dias));
  while (faltan > 0) {
    d = sumar(d, -1);
    if (esHabil(aFecha(d))) faltan--;
  }
  return aFecha(d);
}
