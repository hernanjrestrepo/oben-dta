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
  /** null = no se puede clasificar: Oben no trajo el país (nunca se asume Exportación ni Nacional). */
  kind: FacturacionKind | null;
  direccionEntrega: string | null;
  /**
   * De dónde salió la dirección — nunca se adivina: la digitó el usuario, viene
   * del maestro de clientes, o de la Proforma en Oben+ (`oben_plus`, hoy
   * SIMULADO: ver `simulatedFields`).
   */
  direccionFuente: 'maestro_clientes' | 'digitada' | 'oben_plus' | null;
  observaciones: string | null;
  infoComercial: string | null;
  lines: FacturacionLine[];
  totalValor: number;
  totalKilos: number;
  /** Todo lo que falta para poder generar el documento — nada se inventa. */
  missing: string[];
  readyToGenerate: boolean;
  /** true si algún dato del borrador salió de una fuente SIMULADA — nunca se esconde. */
  simulated: boolean;
  /** Qué campos son simulados (hoy: `direccionEntrega` cuando sale de Oben+ simulado). */
  simulatedFields: string[];
}

/** Resultado de la emisión de factura electrónica (sistema `dian` del hub — hoy SIMULADO). */
export interface FacturaElectronica {
  invoiceNumber: string;
  cufe: string;
  status: string;
  /** true = CUFE del simulador DIAN: no tiene validez fiscal. */
  simulated: boolean;
  emitidaEn: string | null;
}

export interface FacturacionDocument {
  draft: FacturacionDraft;
  filename: string;
  pdf: Buffer;
  /** null = todavía no se ha emitido (se emite al enviar, no al descargar). */
  facturaElectronica: FacturaElectronica | null;
}

export interface FacturacionSendResult {
  sent: boolean;
  to: string[];
  cc: string[];
  filename: string;
  cufe: string;
  cufeSimulado: boolean;
  /** true si el documento enviado lleva algún dato simulado (CUFE o dirección). */
  simulated: boolean;
}
