import type { OrdenProgramada } from './facturas-parciales.service';

/** Hoja y rango del Excel "SEGUIMIENTO DIARIO OBEN COLOMBIA" donde Comercial/Despacho programan la facturación del día. */
export const CUADRO_HOJA = 'MES ACTUAL';
export const CUADRO_RANGO = 'A1:R600';

export interface FilaCuadro {
  ov: number;
  pf: string;
  cliente: string;
  statusOv: string;
  kg: number | null;
  tipo: 'completa' | 'parcial';
  incluida: boolean;
  /** Por qué NO se incluye en el cuadro del día (null si se incluye). */
  motivo: string | null;
}

/** Número de serie de Excel → AAAA-MM-DD. */
export function fechaDeExcel(v: unknown): string | null {
  if (typeof v === 'number' && v > 40000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10);
  return null;
}

const t = (v: unknown) => String(v ?? '').trim();

/**
 * Cuadro del día a partir de la hoja "MES ACTUAL": las filas con "Dia Factura" = la fecha. Se incluyen solo las que
 * dicen "Facturar" (no "Espera Complemento") y que aún no están facturadas (OV Facturada ≠ "Si"); las de la lista
 * "no facturar" quedan fuera. Una OV repetida con la misma fecha cuenta una sola vez. El tipo es "parcial" cuando
 * la orden quedó con saldo o despacho parcial (se factura con su correo "Facturar Parcial"), si no "completa".
 */
export function filasDelDia(matriz: unknown[][], fecha: string, noFacturarOv: number[] = []): { filas: FilaCuadro[]; encabezadoEnFila: number } {
  const hi = matriz.findIndex((f) => f.some((x) => t(x).toLowerCase() === 'status ov'));
  if (hi < 0) throw new Error(`No encontré el encabezado "Status OV" en la hoja ${CUADRO_HOJA}: ¿cambió el formato del Excel?`);
  const col = (n: string) => matriz[hi].findIndex((x) => t(x).toLowerCase() === n.toLowerCase());
  const c = { status: col('Status OV'), ov: col('OV'), cliente: col('Cliente'), pf: col('Proforma'), fact: col('OV Facturada'), kg: col('Total KG'), facturar: col('Facturar'), dia: col('Dia Factura') };
  const faltan = Object.entries(c).filter(([, i]) => i < 0).map(([k]) => k);
  if (faltan.length) throw new Error(`Al Excel le faltan columnas que usamos (${faltan.join(', ')}): ¿cambió el formato?`);
  const vistas = new Set<number>();
  const filas: FilaCuadro[] = [];
  for (const f of matriz.slice(hi + 1)) {
    if (fechaDeExcel(f[c.dia]) !== fecha) continue;
    const ov = Number(f[c.ov]);
    const pf = t(f[c.pf]);
    if (!Number.isInteger(ov) || ov <= 0 || !/^\d{1,12}$/.test(pf) || vistas.has(ov)) continue;
    vistas.add(ov);
    const statusOv = t(f[c.status]).toUpperCase();
    const kg = Number(f[c.kg]);
    let motivo: string | null = null;
    if (t(f[c.facturar]).toLowerCase() !== 'facturar') motivo = `La columna Facturar dice "${t(f[c.facturar]) || 'vacío'}", no "Facturar".`;
    else if (/^s[ií]$/i.test(t(f[c.fact]))) motivo = 'El Excel ya la marca como facturada (OV Facturada = Sí).';
    else if (noFacturarOv.includes(ov)) motivo = 'Está en la lista "no facturar".';
    filas.push({
      ov,
      pf,
      cliente: t(f[c.cliente]),
      statusOv,
      kg: Number.isFinite(kg) && kg > 0 ? kg : null,
      tipo: statusOv === 'SALDO PENDIENTE' || statusOv === 'DESPACHO PARCIAL' ? 'parcial' : 'completa',
      incluida: motivo === null,
      motivo,
    });
  }
  return { filas, encabezadoEnFila: hi + 1 };
}

export const aOrdenProgramada = (f: FilaCuadro): OrdenProgramada => ({ ov: f.ov, pf: f.pf, tipo: f.tipo, estadoOben: f.statusOv, cliente: f.cliente });
