/**
 * Clasificación de los 3 tipos de pedido descritos en
 * `Business/OBEN MAS - PARADIXE.pdf`: Exportación, Nacional Completo y
 * Nacional Parcial. "Parcial" no se puede determinar todavía de forma
 * automática (no existe un evento/API real que indique despacho parcial vs.
 * completo) — se recibe como bandera manual (`FacturacionInput.parcial`)
 * hasta que Oben confirme cómo distinguirlo.
 */
export type FacturacionKind = 'exportacion' | 'nacional_completo' | 'nacional_parcial';

export interface FacturacionLine {
  codSecLineFilm: number;
  tipoPelicula: string;
  precio: number;
  kilosTotal: number;
  valorLinea: number;
}

/** Todo lo que el usuario puede confirmar/digitar a mano — nunca se inventa. */
export interface FacturacionInput {
  direccionEntrega?: string | null;
  observaciones?: string | null;
  infoComercial?: string | null;
  /** true = despacho parcial (Nacional Parcial); default false = completo. Solo aplica si el pedido es nacional. */
  parcial?: boolean;
}

export interface FacturacionDraft {
  numberOrderSales: number;
  cliente: string;
  pais: string | null;
  proforma: string | null;
  ordenCompra: string | null;
  contenedor: string | null;
  codigoMaterial: string | null;
  kind: FacturacionKind;
  direccionEntrega: string | null;
  /** De dónde salió la dirección — nunca se adivina; solo se usa si viene del maestro de clientes o la digitó el usuario. */
  direccionFuente: 'maestro_clientes' | 'digitada' | null;
  observaciones: string | null;
  infoComercial: string | null;
  lines: FacturacionLine[];
  totalValor: number;
  totalKilos: number;
  /** Todo lo que falta para poder generar el documento — nada se inventa. */
  missing: string[];
  readyToGenerate: boolean;
}

export interface FacturacionDocument {
  draft: FacturacionDraft;
  filename: string;
  pdf: Buffer;
}

export interface FacturacionSendResult {
  sent: boolean;
  to: string[];
  cc: string[];
  filename: string;
}
