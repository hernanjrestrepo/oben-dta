import type { AdapterMode } from '../integrations/hub/adapter.types';

/**
 * Contrato que el módulo Comercial espera del sistema `obenPlus` (OBEN MAS /
 * Oben+). HOY solo existe el simulador (ObenPlusMockAdapter): Oben no ha
 * expuesto todavía ningún stored procedure de Proformas, cartera ni cubicaje
 * (ver `Business/oben_comercial_blueprint_2026-09-27.html`, sección 1). El
 * adapter real que se agregue debe devolver exactamente esta forma; el
 * servicio la valida igual, sin asumirla.
 *
 * Estados de la Proforma según el blueprint: se crea "sin cubicar", Planeación
 * la cubica ("ubicada"), el cliente la aprueba y la OV queda "retenida" hasta
 * que Cartera libera el cupo, y entonces pasa a "activa".
 */
export const PROFORMA_ESTADOS = ['sin_cubicar', 'ubicada', 'retenida', 'activa'] as const;
export type ProformaEstado = (typeof PROFORMA_ESTADOS)[number];

export interface ProformaFechas {
  creacion: string | null;
  produccionInicio: string | null;
  produccionFin: string | null;
  entregaComprometida: string | null;
}

/** `obenPlus` → `proforma.status` */
export interface ObenPlusProformaStatus {
  simulated?: boolean;
  numberPF: string;
  cliente: string;
  estado: ProformaEstado;
  exportacion: boolean;
  pais: string | null;
  direccionEntrega: string | null;
  fechas: ProformaFechas;
}

/** `obenPlus` → `proforma.cartera` */
export interface ObenPlusCartera {
  simulated?: boolean;
  liberada: boolean;
  fechaLiberacion: string | null;
  observacion: string | null;
}

/** `obenPlus` → `proforma.cubicaje` */
export interface ObenPlusCubicaje {
  simulated?: boolean;
  tipoContenedor: string | null;
  contenedoresPlaneados: number;
  contenedoresCargados: number;
  pesoPlaneadoKg: number;
  pesoCargadoKg: number;
  volumenPlaneadoM3: number;
  volumenCargadoM3: number;
}

/** De qué modo del hub salió cada dato — `mock` = simulado. */
export type ComercialFuentes = Partial<Record<'status' | 'cartera' | 'cubicaje' | 'list', AdapterMode>>;

export interface ProformaTracking {
  numberPF: string;
  /** true si CUALQUIER dato de esta respuesta salió del simulador — nunca se esconde. */
  simulated: boolean;
  fuentes: ComercialFuentes;
  cliente: string | null;
  estado: ProformaEstado | null;
  exportacion: boolean | null;
  pais: string | null;
  direccionEntrega: string | null;
  fechas: ProformaFechas | null;
  cartera: Omit<ObenPlusCartera, 'simulated'> | null;
  cubicaje: (Omit<ObenPlusCubicaje, 'simulated'> & { avanceCargaPct: number | null }) | null;
  /** Qué sigue en el pipeline Comercial según el estado (blueprint, sección 1). */
  siguientePaso: string | null;
  alertas: string[];
  /** Lo que no se pudo consultar — nada se rellena con un valor plausible. */
  missing: string[];
}

export interface ProformaResumen {
  numberPF: string;
  cliente: string;
  estado: ProformaEstado;
  exportacion: boolean;
  pais: string | null;
  entregaComprometida: string | null;
}

export interface ProformaListResult {
  simulated: boolean;
  fuentes: ComercialFuentes;
  proformas: ProformaResumen[];
  /** Filas que Oben+ devolvió con una forma inválida — no se muestran, pero tampoco se esconden. */
  missing: string[];
}

export interface ComercialDashboard {
  simulated: boolean;
  fuentes: ComercialFuentes;
  generadoEn: string;
  totales: {
    total: number;
    /** sin_cubicar + ubicada + retenida: todavía no están en producción. */
    pendientes: number;
    activas: number;
    exportacion: number;
    nacional: number;
  };
  porEstado: Record<ProformaEstado, number>;
  porCliente: Array<{ cliente: string; total: number; pendientes: number; activas: number }>;
  retenidasPorCartera: Array<{ numberPF: string; cliente: string; creacion: string | null }>;
  /** Activas/retenidas con entrega comprometida en los próximos 14 días (o ya vencida). */
  proximasEntregas: Array<{ numberPF: string; cliente: string; entregaComprometida: string; vencida: boolean }>;
  missing: string[];
}
