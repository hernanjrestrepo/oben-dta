import type { LiquidacionDraft } from './liquidacion.types';

/**
 * Lo que pasa al aprobar COMEX vive en Facturación (correo de revisión + factura) y en Lista de Empaque (correos de
 * exportación retenidos), que dependen de Liquidación: el controlador los resuelve por estos tokens en la misma
 * petición para no crear una dependencia circular entre módulos.
 */
export const APROBACION_COMEX = 'APROBACION_COMEX';
export const LIBERAR_EXPORTACION = 'LIBERAR_EXPORTACION';

export interface TrasAprobacionComex {
  procesar(draft: LiquidacionDraft, aprobacion: { por: string | null; huella: string }): Promise<unknown>;
}

export interface LiberarExportacion {
  liberarTrasAprobacionComex(ovs: number[]): Promise<Array<{ ov: number; resultado: string }>>;
}
