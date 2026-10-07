import { OBEN_REPORTS } from '../oben-reports/oben-report-registry';

/**
 * Catálogo de lo que Oben Xmart envía por correo (WO-026 / WO-027): cada
 * clave es la `entityKey` con la que una lista de distribución se asocia
 * ('document' + clave) y, si tiene `formato`, el asunto y el cuerpo por
 * defecto que el módulo de Formatos permite editar.
 *
 * Las claves deben coincidir con las que usa cada módulo al resolver
 * destinatarios (packing-list, oben-reports, facturacion, liquidacion,
 * comercial) — cambiarlas aquí no cambia esos envíos.
 */
export type GrupoEnvio = 'Lista de Empaque' | 'Reportes de Oben' | 'Facturación y liquidación' | 'Comercial';

export interface FormatoPorDefecto {
  asunto: string;
  cuerpo: string;
  variables: VariableFormato[];
}

export interface EnvioCatalogo {
  clave: string;
  label: string;
  descripcion: string;
  grupo: GrupoEnvio;
  /** Se puede disparar con "Enviar ahora" desde una lista (pide el número de OV). */
  manual: boolean;
  /** Asunto y cuerpo editables en Formatos. */
  formato?: FormatoPorDefecto;
}

export type VariableFormato = 'ov' | 'cliente' | 'reporte' | 'origen' | 'sufijo' | 'fecha';

export const VARIABLES_FORMATO: Record<VariableFormato, string> = {
  ov: 'Número de la orden de venta',
  cliente: 'Cliente de la orden',
  reporte: 'Nombre del reporte',
  origen: 'De dónde salieron los datos (lo escribe el sistema)',
  sufijo: '" (Solefilmes)" cuando aplica',
  fecha: 'Fecha y hora del envío',
};

export const ENVIOS_CATALOGO: EnvioCatalogo[] = [
  {
    clave: 'packing_list',
    label: 'Lista de Empaque (paquete completo)',
    descripcion: 'Lista de Empaque y reportes de la orden. Sale sola al aprobarse el corte.',
    grupo: 'Lista de Empaque',
    manual: true,
    formato: {
      asunto: 'Lista de Empaque — Orden {ov}{sufijo}',
      cuerpo: 'Adjuntos los documentos de la orden {ov}, generados automáticamente al recibir la aprobación de corte, {origen}.',
      variables: ['ov', 'cliente', 'sufijo', 'origen', 'fecha'],
    },
  },
  {
    clave: 'packing_list_escalation',
    label: 'Escalamiento de Lista de Empaque',
    descripcion: 'Aviso cuando a una orden le siguen faltando reportes tras los reintentos.',
    grupo: 'Lista de Empaque',
    manual: false,
  },
  {
    clave: 'packing_list_cartera',
    label: 'Retención por cartera',
    descripcion: 'Aviso cuando una orden no genera Lista de Empaque porque cartera no ha liberado.',
    grupo: 'Lista de Empaque',
    manual: false,
  },
  {
    clave: 'document_package',
    label: 'Conjunto de documentos',
    descripcion: 'Todos los reportes de una orden en un solo correo.',
    grupo: 'Reportes de Oben',
    manual: true,
    formato: {
      asunto: 'Conjunto de documentos — Orden {ov}',
      cuerpo: 'Adjunto el conjunto de documentos de la orden {ov}, {origen}.',
      variables: ['ov', 'cliente', 'origen', 'fecha'],
    },
  },
  ...OBEN_REPORTS.map(
    (r): EnvioCatalogo => ({
      clave: r.key,
      label: r.label,
      descripcion: `Reporte "${r.label}" de una orden.`,
      grupo: 'Reportes de Oben',
      manual: true,
      formato: {
        asunto: '{reporte} — Orden {ov}',
        cuerpo: 'Adjunto el reporte "{reporte}" de la orden {ov}, {origen}.',
        variables: ['ov', 'reporte', 'origen', 'fecha'],
      },
    }),
  ),
  {
    clave: 'facturacion',
    label: 'Borrador de factura',
    descripcion: 'PDF del borrador de factura. Se envía desde Liquidación y Facturación.',
    grupo: 'Facturación y liquidación',
    manual: false,
  },
  {
    clave: 'liquidacion_aprobacion',
    label: 'Liquidación para aprobar (COMEX)',
    descripcion: 'Aviso a COMEX cuando sale la Lista de Empaque de una exportación: su liquidación queda lista para aprobar.',
    grupo: 'Facturación y liquidación',
    manual: false,
  },
  {
    clave: 'liquidacion_cierre',
    label: 'Cierre de liquidación',
    descripcion: 'Correo a COMEX cuando una liquidación queda registrada en Oben.',
    grupo: 'Facturación y liquidación',
    manual: false,
  },
  {
    clave: 'comercial_customer_service',
    label: 'Customer Service',
    descripcion: 'Avisos del flujo Comercial a Customer Service.',
    grupo: 'Comercial',
    manual: false,
  },
  {
    clave: 'comercial_proforma_copia',
    label: 'Copia de proformas al cliente',
    descripcion: 'Copia interna de cada proforma enviada a un cliente.',
    grupo: 'Comercial',
    manual: false,
  },
  {
    clave: 'comercial_cartera',
    label: 'Cartera (Comercial)',
    descripcion: 'Avisos a cartera de órdenes por liberar.',
    grupo: 'Comercial',
    manual: false,
  },
];

export function envioDeCatalogo(clave: string): EnvioCatalogo | undefined {
  return ENVIOS_CATALOGO.find((e) => e.clave === clave);
}
