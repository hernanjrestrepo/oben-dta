import type { MiaHerramienta } from './mia-llm';
import { OBEN_REPORTS } from '../oben-reports/oben-report-registry';
import { LIQUIDACION_PERMISSION } from '../liquidacion/liquidacion.controller';

/** Pantallas a las que MIA puede llevar al usuario (mismas rutas del menú lateral). */
export const MIA_PANTALLAS: Record<string, string> = {
  '/operaciones': 'Centro de Operaciones',
  '/dashboard': 'Dashboard',
  '/comercial': 'Comercial',
  '/quotes': 'Cotizaciones',
  '/orders': 'Órdenes',
  '/invoices': 'Facturas',
  '/fletes': 'Fletes',
  '/lista-empaque': 'Lista de Empaque',
  '/facturacion': 'Liquidación y Facturación',
  '/reportes': 'Reportes Oben',
  '/clients': 'Clientes',
  '/equivalencias': 'Equivalencias',
  '/distribucion': 'Listas de Distribución',
};

/** Documentos que MIA puede ofrecer para descargar: el PDF de factura y los reportes Excel de Oben. */
export const MIA_DOCUMENTOS: Record<string, string> = {
  factura_pdf: 'PDF de la factura (borrador)',
  ...Object.fromEntries(OBEN_REPORTS.map((r) => [r.key, `${r.label} (Excel)`])),
};

const limite = {
  type: 'integer',
  minimum: 1,
  maximum: 50,
  description: 'Cuántos registros traer (por defecto 10).',
};
const ov = {
  type: 'integer',
  minimum: 1,
  description: 'Número de la orden de venta (OV) de Oben, p. ej. 11187.',
};

/**
 * Herramientas de MIA. `permiso` es el mismo que exige el endpoint REST
 * equivalente: MIA nunca le muestra a un usuario algo que su rol no le
 * permitiría ver en la pantalla (null = sin dato sensible).
 */
export const MIA_TOOLS: Array<{
  permiso: string | null;
  tool: MiaHerramienta;
}> = [
  {
    permiso: 'invoices.read',
    tool: {
      name: 'ultimas_facturas',
      description:
        'Facturas más recientes de Oben Xmart: los envíos de factura hechos desde "Liquidación y Facturación" (fecha y hora, OV, destinatarios, CUFE y si es simulado) y las facturas del módulo Facturas. Úsala para "¿cuándo fue la última factura?", "¿qué se facturó hoy?", etc.',
      input_schema: {
        type: 'object',
        properties: { limite },
        additionalProperties: false,
      },
    },
  },
  {
    permiso: 'invoices.read',
    tool: {
      name: 'ordenes_recientes',
      description:
        'Órdenes de venta (OV) reales recientes de Oben: las que ya tienen corte aprobado y Lista de Empaque enviada (número de OV, cliente y fecha).',
      input_schema: {
        type: 'object',
        properties: { limite },
        additionalProperties: false,
      },
    },
  },
  {
    permiso: 'invoices.read',
    tool: {
      name: 'consultar_facturacion_orden',
      description:
        'Datos de facturación de una OV consultados en vivo al ERP de Oben (cliente, país, proforma, orden de compra, contenedor, líneas con kilos y precios, valor total, tipo exportación/nacional, datos faltantes) y su historial de envíos de factura. Puede tardar unos segundos.',
      input_schema: {
        type: 'object',
        properties: { ov },
        required: ['ov'],
        additionalProperties: false,
      },
    },
  },
  {
    permiso: LIQUIDACION_PERMISSION,
    tool: {
      name: 'consultar_liquidacion',
      description:
        'Liquidación de una proforma (PF) calculada en vivo con la fórmula de Oben: Incoterm, país, dirección y puertos, partidas arancelarias, flete, seguro, otros gastos, Destination Charges (USA), valores por línea, ajustes, datos faltantes y si está lista para enviar. Solo consulta: no envía nada a Oben.',
      input_schema: {
        type: 'object',
        properties: {
          pf: {
            type: 'string',
            description: 'Número de la proforma (PF), p. ej. "11366".',
          },
        },
        required: ['pf'],
        additionalProperties: false,
      },
    },
  },
  {
    permiso: 'orders.read',
    tool: {
      name: 'consultar_reporte_oben',
      description:
        'Consulta en vivo un reporte del ERP de Oben para una OV y devuelve sus datos: consumo de material de empaque o materia prima, Lista de Empaque unificada o detallada (kilos, rollos, pallets), Check Línea, Empaque Solefilmes o Check Settlement.',
      input_schema: {
        type: 'object',
        properties: {
          reporte: {
            type: 'string',
            enum: OBEN_REPORTS.map((r) => r.key),
            description: OBEN_REPORTS.map((r) => `${r.key} = ${r.label}`).join(
              '; ',
            ),
          },
          ov,
        },
        required: ['reporte', 'ov'],
        additionalProperties: false,
      },
    },
  },
  {
    permiso: 'quotes.read',
    tool: {
      name: 'tarifas_flete',
      description:
        'Tabla de fletes cargada en Oben Xmart (archivo de fletes de Oben): flete marítimo puerto a puerto/rampa (pata 2: origen, destino, forwarder, naviera, tránsito, valor, vigencia), Inland Freight por destino en USA o Canadá (pata 3: puerto, dirección, valor contenedor 40HC, vigencia) y recargos de destino por país de origen (Entry Fee, Importer Security Filing, Harbor Maintenance Fee).',
      input_schema: {
        type: 'object',
        properties: {
          buscar: {
            type: 'string',
            description:
              'Ciudad, estado, puerto o código postal del destino (u origen del flete marítimo), p. ej. "Houston", "Dallas" o "75212".',
          },
          pais: {
            type: 'string',
            enum: ['USA', 'CA'],
            description: 'País de destino del Inland Freight.',
          },
          origen: {
            type: 'string',
            description:
              'País de origen para los recargos (por defecto Colombia).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    permiso: 'quotes.read',
    tool: {
      name: 'consultar_cotizaciones',
      description:
        'Cotizaciones de Oben Xmart, la más reciente primero (número, cliente, total en COP, estado, fecha). Se puede filtrar por número o nombre del cliente.',
      input_schema: {
        type: 'object',
        properties: {
          buscar: {
            type: 'string',
            description: 'Número de cotización o nombre del cliente.',
          },
          limite,
        },
        additionalProperties: false,
      },
    },
  },
  {
    permiso: 'clients.read',
    tool: {
      name: 'consultar_clientes',
      description:
        'Clientes registrados en Oben Xmart (nombre, código Oben, correo, dominios autorizados, cupo de crédito y usado, si está activo).',
      input_schema: {
        type: 'object',
        properties: {
          buscar: {
            type: 'string',
            description: 'Nombre, código Oben, correo o dominio del cliente.',
          },
          limite,
        },
        additionalProperties: false,
      },
    },
  },
  {
    permiso: 'products.read',
    tool: {
      name: 'consultar_productos',
      description:
        'Catálogo de productos activos de Oben Xmart (SKU, nombre, precio en COP/kg, inventario).',
      input_schema: {
        type: 'object',
        properties: {
          buscar: {
            type: 'string',
            description: 'SKU o parte del nombre, p. ej. "BOPP".',
          },
          limite,
        },
        additionalProperties: false,
      },
    },
  },
  {
    // El permiso real lo decide el documento (ver permisoDocumento): la descarga
    // la hace la pantalla contra el mismo endpoint protegido de siempre.
    permiso: null,
    tool: {
      name: 'generar_documento',
      description:
        'Prepara un documento de una OV para que el usuario lo descargue con un botón en el chat: el PDF de la factura o un reporte Excel de Oben (Lista de Empaque, consumos, etc.).',
      input_schema: {
        type: 'object',
        properties: {
          documento: {
            type: 'string',
            enum: Object.keys(MIA_DOCUMENTOS),
            description: Object.entries(MIA_DOCUMENTOS)
              .map(([k, v]) => `${k} = ${v}`)
              .join('; '),
          },
          ov,
        },
        required: ['documento', 'ov'],
        additionalProperties: false,
      },
    },
  },
  {
    // Sin permiso propio: el contenido sale de otras herramientas, que ya exigen el suyo.
    permiso: null,
    tool: {
      name: 'exportar_archivo',
      description:
        'Genera un archivo PDF, Excel o Word con un reporte o documento que tú armas (título, párrafos y tablas) con datos que YA consultaste con las otras herramientas. En el chat aparece un botón para descargarlo. Úsala cuando el usuario pida un reporte, listado o documento en PDF, Excel o Word.',
      input_schema: {
        type: 'object',
        properties: {
          formato: { type: 'string', enum: ['pdf', 'xlsx', 'docx'], description: 'pdf, xlsx (Excel) o docx (Word).' },
          titulo: { type: 'string', description: 'Título del documento.' },
          parrafos: { type: 'array', items: { type: 'string' }, description: 'Texto del documento, un párrafo por elemento.' },
          tablas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titulo: { type: 'string' },
                columnas: { type: 'array', items: { type: 'string' } },
                filas: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'null'] } } },
              },
              required: ['columnas', 'filas'],
            },
            description: 'Tablas del documento (en Excel, cada una va en su hoja).',
          },
        },
        required: ['formato', 'titulo'],
        additionalProperties: false,
      },
    },
  },
  {
    permiso: null,
    tool: {
      name: 'abrir_pantalla',
      description:
        'Muestra en el chat un botón para ir a una pantalla de Oben Xmart (opcionalmente con una OV ya cargada en Liquidación y Facturación).',
      input_schema: {
        type: 'object',
        properties: {
          ruta: {
            type: 'string',
            enum: Object.keys(MIA_PANTALLAS),
            description: Object.entries(MIA_PANTALLAS)
              .map(([k, v]) => `${k} = ${v}`)
              .join('; '),
          },
          ov: {
            ...ov,
            description: 'Solo para /facturacion: OV que debe quedar cargada.',
          },
        },
        required: ['ruta'],
        additionalProperties: false,
      },
    },
  },
  {
    permiso: 'quotes.create',
    tool: {
      name: 'crear_cotizacion',
      description:
        'Genera una cotización REAL en Oben Xmart y se la ENVÍA por correo al cliente (PDF). Úsala solo cuando el usuario pida explícitamente cotizar para un cliente identificado por su correo.',
      input_schema: {
        type: 'object',
        properties: {
          clienteEmail: {
            type: 'string',
            description:
              'Correo del cliente (de un dominio de cliente ya registrado en Oben Xmart).',
          },
          descripcionPedido: {
            type: 'string',
            description:
              'Productos y cantidades en texto libre, p. ej. "500 kg de BOPP Transparente y 10 kg de BOPA".',
          },
        },
        required: ['clienteEmail', 'descripcionPedido'],
        additionalProperties: false,
      },
    },
  },
];

/** La factura se protege con `invoices.read`; los reportes de Oben con `orders.read` (mismos endpoints de descarga). */
export function permisoDocumento(documento: string): string {
  return documento === 'factura_pdf' ? 'invoices.read' : 'orders.read';
}
