/** Ajustes de Xmart Academy (`tenants.settings.academy`). */
export interface AjustesAcademy {
  /** Lo transaccional solo se habilita al aprobar el quiz del módulo (Hernán, 23-oct). Apagado hasta que se active. */
  exigirCertificacion: boolean;
  puntajeMinimo: number;
  /** Personas a las que no se les exige (por ejemplo, mientras se capacitan con urgencia). */
  exentos: string[];
}

export const PUNTAJE_MINIMO_POR_DEFECTO = 80;

export function ajustesDe(settings: Record<string, unknown> | null | undefined): AjustesAcademy {
  const a = ((settings ?? {}).academy ?? {}) as Partial<AjustesAcademy>;
  const min = Number(a.puntajeMinimo);
  return {
    exigirCertificacion: a.exigirCertificacion === true,
    puntajeMinimo: Number.isFinite(min) && min >= 50 && min <= 100 ? Math.round(min) : PUNTAJE_MINIMO_POR_DEFECTO,
    exentos: Array.isArray(a.exentos) ? a.exentos.filter((x): x is string => typeof x === 'string') : [],
  };
}
