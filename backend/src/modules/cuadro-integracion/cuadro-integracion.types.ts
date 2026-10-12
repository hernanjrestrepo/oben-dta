/**
 * Cuadro de integración (Certificado de Integración de Zona Franca, WO-033).
 * Entrada = lo que dará el ERP de Oben (consumo por orden + maestros); salida = el cuadro que hoy arman en Excel.
 */
export type TipoMaterial = 'MP' | 'ME';
export type OrigenInsumo = 'nacional' | 'extranjero';

export interface MaterialMaestro {
  /** Autorización/referencia de zona franca (p. ej. 69256-003): es la clave del insumo en el certificado. */
  referencia: string;
  descripcion: string;
  subpartida: string | null;
  tipo: TipoMaterial;
  origen: OrigenInsumo;
  unidad: string;
  /** % de desperdicio (0.05 = 5 %). */
  pctDesperdicio: number;
  /** % de regranulado sobre el consumo (0.105 = 10,5 %); solo aplica a materia prima (MP). */
  pctRegranulado: number;
  /** kg por unidad cuando la unidad no es KG (estibas, conos...). */
  kgPorUnidad: number | null;
  /** US$ por unidad de cantidad. null = sin costo (el cuadro queda incompleto y se avisa). */
  valorUnitUsd: number | null;
  /** Declaración de importación asociada, si existe. */
  declaracion: string | null;
}

export interface ConsumoOrden {
  referencia: string;
  /** Consumo real de la orden, en la unidad del material. Varias líneas de la misma referencia se suman. */
  cantidad: number;
}

export interface ProductoElaborado {
  referencia: string;
  descripcion: string;
  subpartida: string;
  cantidadKg: number;
  valorUsd: number;
}

export interface CuadroIntegracionEntrada {
  orden: string;
  destino: string;
  productos: ProductoElaborado[];
  consumos: ConsumoOrden[];
  materiales: MaterialMaestro[];
  otrosCostos: { concepto: string; valorUsd: number }[];
}

export interface LineaInsumo {
  referencia: string;
  declaracion: string | null;
  subpartida: string | null;
  descripcion: string;
  origen: OrigenInsumo;
  unidad: string;
  consumo: number;
  desperdicio: number;
  regranulado: number;
  /** Cantidad que va en el certificado (MP: con desperdicio y regranulado; ME: el consumo). */
  cantidad: number;
  pesoNetoKg: number | null;
  valorUsd: number | null;
  /** Como lo imprime la Zona Franca: desperdicio / cantidad × 100 sobre valores redondeados a 2 decimales. */
  pctDesperdicio: number;
}

export interface LineaDesperdicio {
  referencia: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  pesoNetoKg: number | null;
  valorUsd: number | null;
}

export interface CuadroIntegracion {
  orden: string;
  destino: string;
  /** true mientras los datos no vengan del ERP de Oben (nunca llega a un envío real). */
  simulado: boolean;
  productos: ProductoElaborado[];
  insumosNacionales: LineaInsumo[];
  insumosExtranjeros: LineaInsumo[];
  desperdicios: LineaDesperdicio[];
  otrosCostos: { concepto: string; valorUsd: number }[];
  totales: {
    productoKg: number;
    productoUsd: number;
    nacionalesUsd: number;
    extranjerosUsd: number;
    otrosUsd: number;
    desperdiciosKg: number;
    participacionNacionalPct: number;
    participacionExtranjeraPct: number;
    participacionOtrosPct: number;
  };
  /** Masa: consumo de materia prima en kg vs producto elaborado principal (sin el recuperado). */
  balanceMasa: { consumoMpKg: number; productoKg: number; diferenciaKg: number; cuadra: boolean };
  /** Lo que impide o pone en duda el certificado (referencia sin maestro, sin costo, sin conversión...). */
  avisos: string[];
}

export interface CuadroIntegracionFuente {
  readonly simulada: boolean;
  obtener(orden: string): Promise<CuadroIntegracionEntrada | null>;
}

export const CUADRO_INTEGRACION_FUENTE = Symbol('CUADRO_INTEGRACION_FUENTE');
