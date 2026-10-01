import type { ResolucionDian } from './emisor';

export type TipoFacturaDian = 'nacional' | 'exportacion';

export interface FacturaDianLinea {
  item: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  valorUnitario: number;
  ivaPct: number;
  ivaValor: number;
  total: number;
}

/**
 * Todo lo que se imprime en la representación gráfica de la factura
 * electrónica de Oben (formato de Facture / PL-Colab). Un campo en null sale
 * en blanco — igual que en las facturas reales cuando el dato no existe.
 */
export interface FacturaDian {
  tipo: TipoFacturaDian;
  /** "FV11363" / "FEXP3190"; null = todavía no emitida (borrador). */
  numero: string | null;
  resolucion: ResolucionDian;
  cliente: {
    nombre: string;
    nit: string | null;
    direccion: string | null;
    ciudad: string | null;
    departamento: string | null;
    pais: string | null;
    telefono: string | null;
    correo: string | null;
  };
  /** Ya formateadas como en el original de cada tipo. */
  fechaEmision: string;
  fechaVencimiento: string | null;
  pedido: string | null;
  ordenCompra: string | null;
  remision: string | null;
  condicionesVenta: string | null;
  medioPago: string;
  formaPago: string;
  moneda: 'COP' | 'USD';
  lineas: FacturaDianLinea[];
  /** Observaciones, una entrada por línea (nacional: texto libre; exportación: PF/OV, pesos, partidas, valores…). */
  observaciones: string[];
  /** Exportación: va en negrilla al final de las observaciones. */
  tipoCambio: number | null;
  subtotal: number;
  ivaPct: number;
  iva: number;
  retefuente: number;
  flete: number;
  seguro: number;
  /** DAP/DDP: otros gastos (Destination Charges) que completan el valor negociado. */
  otrosGastos: number;
  neto: number;
  valorLetras: string;
  /** Solo nacional: el mismo valor en inglés. */
  valorLetrasIngles: string | null;
  incoterm: string | null;
  /** Exportación: forma de pago del pie ("20% IN ADVANCE/ 80% AT SIGHT"). */
  terminosPago: string | null;
  cufe: string | null;
  cufeSimulado: boolean;
  /** Contenido del código QR (formato DIAN: NumFac, FecFac, …, CUFE, URL de consulta). */
  qr: string;
  /** Marca de agua mientras el documento no sea una factura electrónica real ("BORRADOR" / "SIMULADO"). */
  marcaAgua: string | null;
}
