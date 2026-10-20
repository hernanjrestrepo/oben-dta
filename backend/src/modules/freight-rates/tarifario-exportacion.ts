import * as XLSX from 'xlsx';

/**
 * Lector del tarifario de fletes de exportación de COMEX ("Fletes Exportacion_Oben <Mes> 2026.xlsx", el que
 * María mantiene y sube desde la pantalla de Liquidación — reunión del 20-oct). Formato de 3 patas:
 *   - "Update - Freight Leg2": flete MARÍTIMO puerto → puerto/rampa (→ freight_ocean_rates).
 *   - "Update - Freight Leg3": flete terrestre en destino, del puerto/rampa al cliente (→ freight_inland_rates,
 *     solo Estados Unidos y Canadá, contenedor de 40').
 *   - La pata 1 (planta → puerto) NO se carga: queda dentro del FOB (verificado con la PF 10867).
 * Mismas reglas con que se cargó a mano el archivo de octubre el 1-oct (no cambian los datos que ya usa la
 * liquidación). Puro: no toca la base de datos.
 */

export interface FilaMaritima {
  origin: string;
  destination: string;
  destinationPort: string;
  containerType: string;
  forwarder: string;
  shippingLine: string | null;
  transitPoints: string | null;
  transitDays: number | null;
  rateTotal: number;
  carrierDestinationCharges: number | null;
  isPartial: boolean;
  effectiveDate: string | null;
  validUntil: string | null;
}

export interface FilaInland {
  country: 'USA' | 'CA';
  forwarder: string;
  destinationPort: string;
  state: string;
  destinationAddress: string;
  weightLbs: number | null;
  rate40hc: number;
  customsCommission: number | null;
  transitTimeDays: number | null;
  validUntil: string | null;
}

export interface TarifarioLeido {
  maritimas: FilaMaritima[];
  inland: FilaInland[];
  /** Filas que no se pudieron leer o que no aplican (con el motivo), para mostrarlas antes de cargar. */
  descartadas: Array<{ hoja: string; fila: number; motivo: string }>;
}

export const HOJA_MARITIMA = 'Update - Freight Leg2';
export const HOJA_INLAND = 'Update - Freight Leg3';

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined || typeof v === 'object') return null;
  const t = String(v as string | number | boolean).trim();
  return t ? t : null;
};
const numero = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.replace(/[$\s]/g, '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Fecha de Excel (número de serie o texto) → "AAAA-MM-DD". */
export function fechaExcel(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const t = texto(v);
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
}

/** "TRANSBORDER" → "Transborder"; lo que ya viene con mayúsculas y minúsculas se respeta ("Savino del Bene"). */
export function nombreProveedor(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  // Solo se arregla lo que viene todo en mayúsculas o todo en minúsculas ("SHAPIRO", "shapiro").
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t;
  return t.toLowerCase().replace(/(^|[\s&/-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

/**
 * Puerto/rampa en el formato que empalma pata 2 con pata 3: "Atlanta, GA, United States (USATL) - Ramp" →
 * "Atlanta, GA (Ramp)"; "Itapoa, SC, 89249-000, Brazil (BRIOA) - Port" → "Itapoa, SC (Port)". Sin estado de
 * 2 letras se deja tal cual ("Buenos Aires, Argentina (ARBUE) - Port", "Altamira, TAM, Mexico (MXATM) - Port").
 */
export function puertoCorto(lugar: string): string {
  const tipo = lugar.match(/-\s*(Port|Ramp)\s*$/i)?.[1];
  const partes = lugar.replace(/\s*\([A-Z]{5}\)/, '').replace(/\s*-\s*(Port|Ramp)\s*$/i, '').split(',').map((p) => p.trim());
  if (tipo && partes.length >= 2 && /^[A-Z]{2}$/.test(partes[1])) return `${partes[0]}, ${partes[1]} (${tipo[0].toUpperCase()}${tipo.slice(1).toLowerCase()})`;
  return lugar;
}

/**
 * Estado o provincia de la dirección de entrega: "Birmingham, AL 35234" → "AL"; "Oshkosh, WI, 54904, United
 * States" → "WI"; "Asheville NC 28803-2114" → "NC"; "Amherst, NS B4H 4J6" → "NS"; "ON M1X 1B9 Ontario" → "ON";
 * "1009 Rock Avenue Yakima Wa 98902 USA" → "WA"; "Winnipeg, MB" → "MB".
 */
export function estadoDe(direccion: string): string | null {
  const m =
    direccion.match(/,\s*([A-Z]{2})\b/) ??
    direccion.match(/\b([A-Z]{2})\s+\d{5}/) ??
    direccion.match(/^([A-Z]{2})\s/) ??
    direccion.match(/\b([A-Za-z]{2})\s+\d{5}/) ??
    direccion.match(/\b([A-Z]{2})\s*$/);
  return m ? m[1].toUpperCase() : null;
}

function filas(wb: XLSX.WorkBook, hoja: string): unknown[][] | null {
  const ws = wb.Sheets[hoja];
  return ws ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true }) : null;
}

/** Índice de cada columna por su encabezado (el archivo trae columnas extra de notas al final). */
function columnas(encabezado: unknown[], requeridas: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  encabezado.forEach((h, i) => {
    const t = texto(h);
    if (t && !(t in idx)) idx[t] = i;
  });
  const faltan = requeridas.filter((r) => !(r in idx));
  if (faltan.length) throw new Error(`Faltan columnas: ${faltan.join(', ')}.`);
  return idx;
}

export function leerTarifarioExportacion(buffer: Buffer): TarifarioLeido {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch {
    throw new Error('El archivo no es un Excel válido (.xlsx).');
  }
  const l2 = filas(wb, HOJA_MARITIMA);
  const l3 = filas(wb, HOJA_INLAND);
  if (!l2 || !l3) {
    throw new Error(`El archivo no tiene las hojas "${HOJA_MARITIMA}" y "${HOJA_INLAND}" del tarifario de fletes de exportación.`);
  }
  const descartadas: TarifarioLeido['descartadas'] = [];

  const c2 = (() => {
    try {
      return columnas(l2[0] ?? [], ['Origin', 'Destination', 'ContainerType', 'Forwarder', 'ShippingLine', 'Total', 'ExpirationDate']);
    } catch (e) {
      throw new Error(`Hoja "${HOJA_MARITIMA}": ${(e as Error).message}`);
    }
  })();
  const maritimas: FilaMaritima[] = [];
  l2.slice(1).forEach((r, i) => {
    const fila = i + 2;
    const v = (k: string) => (k in c2 ? r[c2[k]] : null);
    const total = numero(v('Total'));
    const origin = texto(v('Origin'));
    const destination = texto(v('Destination'));
    if (total === null && !origin && !destination) return; // fila vacía
    if (total === null) return void descartadas.push({ hoja: HOJA_MARITIMA, fila, motivo: 'sin valor Total' });
    // Una tarifa en 0 sería "la más barata" y la liquidación la sugeriría: no se carga.
    if (!(total > 0)) return void descartadas.push({ hoja: HOJA_MARITIMA, fila, motivo: 'valor Total en 0' });
    if (!origin || !destination) return void descartadas.push({ hoja: HOJA_MARITIMA, fila, motivo: 'sin origen o destino' });
    const forwarder = nombreProveedor(v('Forwarder'));
    if (!forwarder) return void descartadas.push({ hoja: HOJA_MARITIMA, fila, motivo: 'sin forwarder' });
    const transito = [texto(v('TransitPoint1')), texto(v('TransitPoint2'))].filter(Boolean).join(' / ');
    const dias = numero(v('DaysMin')) ?? (numero(v('TransportTime')) !== null ? (numero(v('TransportTime')) as number) + (numero(v('DwellTime')) ?? 0) : null);
    maritimas.push({
      origin,
      destination,
      destinationPort: puertoCorto(destination),
      containerType: texto(v('ContainerType')) ?? "FCL 40'",
      forwarder,
      shippingLine: texto(v('ShippingLine')),
      transitPoints: transito || null,
      transitDays: dias === null ? null : Math.round(dias),
      rateTotal: Math.round(total * 100) / 100,
      carrierDestinationCharges: numero(v('CarrierDestinationCharges')),
      isPartial: /^s[ií]|^y(es)?$|^true$/i.test(texto(v('IsPartial')) ?? ''),
      effectiveDate: fechaExcel(v('EffectiveDate')),
      validUntil: fechaExcel(v('ExpirationDate')),
    });
  });

  const c3 = (() => {
    try {
      return columnas(l3[0] ?? [], ['Origin', 'Destination', 'ContainerType', 'Forwarder', 'Total', 'ExpirationDate']);
    } catch (e) {
      throw new Error(`Hoja "${HOJA_INLAND}": ${(e as Error).message}`);
    }
  })();
  const inland: FilaInland[] = [];
  l3.slice(1).forEach((r, i) => {
    const fila = i + 2;
    const v = (k: string) => (k in c3 ? r[c3[k]] : null);
    const total = numero(v('Total'));
    const origin = texto(v('Origin'));
    const destination = texto(v('Destination'));
    if (total === null && !origin && !destination) return;
    if (total === null) return void descartadas.push({ hoja: HOJA_INLAND, fila, motivo: 'sin valor Total' });
    if (!(total > 0)) return void descartadas.push({ hoja: HOJA_INLAND, fila, motivo: 'valor Total en 0' });
    if (!origin || !destination) return void descartadas.push({ hoja: HOJA_INLAND, fila, motivo: 'sin origen o destino' });
    const country = /United States/i.test(origin) ? 'USA' : /Canada/i.test(origin) ? 'CA' : null;
    if (!country) return void descartadas.push({ hoja: HOJA_INLAND, fila, motivo: `origen fuera de EE. UU./Canadá (${origin})` });
    const contenedor = texto(v('ContainerType')) ?? "FCL 40'";
    if (!/40/.test(contenedor)) return void descartadas.push({ hoja: HOJA_INLAND, fila, motivo: `contenedor ${contenedor} (la liquidación usa 40')` });
    const forwarder = nombreProveedor(v('Forwarder'));
    if (!forwarder) return void descartadas.push({ hoja: HOJA_INLAND, fila, motivo: 'sin forwarder' });
    const state = estadoDe(destination);
    if (!state) return void descartadas.push({ hoja: HOJA_INLAND, fila, motivo: `no se reconoce el estado en "${destination}"` });
    inland.push({
      country,
      forwarder,
      destinationPort: puertoCorto(origin),
      state,
      destinationAddress: destination,
      weightLbs: null,
      rate40hc: Math.round(total * 100) / 100,
      customsCommission: numero(v('CustomsCommission')),
      transitTimeDays: numero(v('TransportTime')),
      validUntil: fechaExcel(v('ExpirationDate')),
    });
  });

  if (maritimas.length === 0) throw new Error(`La hoja "${HOJA_MARITIMA}" no trae ninguna tarifa con valor.`);
  if (inland.length === 0) throw new Error(`La hoja "${HOJA_INLAND}" no trae ninguna tarifa de EE. UU./Canadá con valor.`);
  return { maritimas, inland, descartadas };
}
