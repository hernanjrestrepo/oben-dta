/**
 * Liquidación consolidada (Hernán, 6-nov): varias proformas viajan en un mismo envío y se liquidan juntas. Una sola ruta
 * (la de la PF principal) con los contenedores de los kilos de TODO el envío; el flete y los gastos del envío se reparten
 * entre las PF por peso. Cada PF se sigue liquidando en Oben por separado (la API es por NumberPF), con su parte.
 */

/** Carga neta de un contenedor de 40' (archivo de fletes de Oben). */
export const NET_PAYLOAD_40_KG = 26_000;

export interface PfParaConsolidar {
  numberPF: string;
  kilos: number;
}

export interface TotalesEnvio {
  /** Flete marítimo de todo el envío (USD). */
  flete: number | null;
  inlandFreight: number | null;
  entryFee: number | null;
  importerSecurityFiling: number | null;
  /** Otros gastos del envío que COMEX indica para destinos sin Destination Charges. */
  otrosGastos: number | null;
}

export interface Reparto {
  numberPF: string;
  kilos: number;
  /** Participación en el peso del envío (0 a 1). */
  participacion: number;
  flete: number | null;
  inlandFreight: number | null;
  entryFee: number | null;
  importerSecurityFiling: number | null;
  otrosGastos: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Contenedores de 40' que necesita el envío completo. */
export function contenedoresDelEnvio(kilosTotales: number): number {
  return Math.max(1, Math.ceil(kilosTotales / NET_PAYLOAD_40_KG));
}

/**
 * Reparte cada monto del envío por peso. Los centavos que sobran del redondeo van a la última PF, para que la suma de
 * las partes sea exactamente el total (como el ajuste de centavos al último ítem de la factura).
 */
export function repartirPorPeso(pfs: PfParaConsolidar[], totales: TotalesEnvio): Reparto[] {
  const kilosTotales = pfs.reduce((a, p) => a + p.kilos, 0);
  if (kilosTotales <= 0) throw new Error('Las proformas no tienen kilos para repartir el flete.');
  const repartir = (total: number | null): Array<number | null> => {
    if (total === null || !Number.isFinite(total)) return pfs.map(() => null);
    const partes = pfs.map((p) => round2((total * p.kilos) / kilosTotales));
    const diferencia = round2(total - partes.reduce((a, x) => a + x, 0));
    partes[partes.length - 1] = round2(partes[partes.length - 1] + diferencia);
    return partes;
  };
  const flete = repartir(totales.flete);
  const inland = repartir(totales.inlandFreight);
  const entry = repartir(totales.entryFee);
  const isf = repartir(totales.importerSecurityFiling);
  const otros = repartir(totales.otrosGastos);
  return pfs.map((p, i) => ({
    numberPF: p.numberPF,
    kilos: p.kilos,
    participacion: p.kilos / kilosTotales,
    flete: flete[i],
    inlandFreight: inland[i],
    entryFee: entry[i],
    importerSecurityFiling: isf[i],
    otrosGastos: otros[i],
  }));
}
