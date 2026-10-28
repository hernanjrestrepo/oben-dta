import type { MiaHerramienta } from './mia-llm';
import { OBEN_REPORTS } from '../oben-reports/oben-report-registry';
import { LIQUIDACION_PERMISSION } from '../liquidacion/liquidacion.controller';

/** Pantallas a las que MIA puede llevar al usuario (mismas rutas del menú lateral). */
export const MIA_PANTALLAS: Record<string, string> = {
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
  '/admin/roles': 'Perfiles (acceso por opción del menú)',
  '/academy': 'Xmart Academy (entrenamiento por perfil)',
  '/facturas-parciales': 'Facturas parciales (cuadro del día y solicitudes a Oben)',
};

/** Documentos que MIA puede ofrecer para descargar: el PDF de factura y los reportes Excel de Oben. */
export const MIA_DOCUMENTOS: Record<string, string> = {
  factura_pdf: 'Vista previa de la factura en PDF (no es factura del ERP)',
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
        'Estado de facturación de una OV: facturaEnErp dice si Oben Xmart creó la factura en el ERP de Oben (y si no, por qué); vistaPreviaOxmart es una vista previa calculada con los datos del ERP (cliente, país, proforma, OC, contenedor, líneas con kilos y precios, valor total, tipo exportación/nacional, datos faltantes) que NO es una factura del ERP; y el historial de envíos de factura. Puede tardar unos segundos.',
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
    permiso: 'orders.read',
    tool: {
      name: 'consultar_casos_comercial',
      description:
        'Casos del módulo Comercial: cada orden de compra (OC) que llega de un cliente y su recorrido hasta la orden de venta activa. Trae cliente, número de OC, estado (oc_recibida, sin_cubicar, cubicada, enviada_cliente, retenida, activa, cerrada, rechazada, anulada), proforma y OV si ya existen, la acción que espera confirmación, lo que falta o requiere atención, las líneas leídas de la orden (referencia de Oben, kilos, ancho) y los últimos eventos. "proformaEnObenMas" trae la Proforma REAL creada en OBEN MAS (número oficial, código interno, servidor, orden de venta y si está activa). Si "simulado" es true, la proforma y la OV son de prueba y no existen en Oben. Úsala para "¿llegó la orden de compra de X?", "¿en qué va la OC-123?", "¿qué casos están esperando confirmación?".',
      input_schema: {
        type: 'object',
        properties: {
          buscar: { type: 'string', description: 'Cliente, número de OC o número de proforma.' },
          estado: { type: 'string', description: 'Filtrar por estado del caso (p. ej. "retenida"). Vacío = los abiertos y los recientes.' },
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
        'Genera un archivo PDF, Excel o Word con la marca de Oben Group (logo, paleta naranja y grafito, páginas numeradas) que tú armas con datos que YA consultaste con las otras herramientas: título, subtítulo, indicadores (tarjetas con cifras clave), párrafos, GRÁFICAS (barras, barras horizontales, líneas, área, torta, dona) y tablas. En el chat aparece un botón para descargarlo. Úsala cuando el usuario pida un reporte, informe, listado o documento en PDF, Excel o Word; si pide gráficas, inclúyelas. Nunca inventes cifras.',
      input_schema: {
        type: 'object',
        properties: {
          formato: { type: 'string', enum: ['pdf', 'xlsx', 'docx'], description: 'pdf, xlsx (Excel) o docx (Word).' },
          titulo: { type: 'string', description: 'Título del documento.' },
          subtitulo: { type: 'string', description: 'Subtítulo opcional (p. ej. periodo o área). Por defecto, la fecha.' },
          indicadores: {
            type: 'array',
            description: 'Cifras clave en tarjetas (máximo 12): etiqueta, valor ya formateado y detalle opcional.',
            items: {
              type: 'object',
              properties: { etiqueta: { type: 'string' }, valor: { type: 'string' }, detalle: { type: 'string' } },
              required: ['etiqueta', 'valor'],
            },
          },
          graficas: {
            type: 'array',
            description: 'Gráficas (máximo 8). En torta/dona usa una sola serie.',
            items: {
              type: 'object',
              properties: {
                titulo: { type: 'string' },
                tipo: { type: 'string', enum: ['barras', 'barras_horizontales', 'lineas', 'area', 'torta', 'dona'] },
                categorias: { type: 'array', items: { type: 'string' }, description: 'Etiquetas del eje X o de cada porción.' },
                series: {
                  type: 'array',
                  items: { type: 'object', properties: { nombre: { type: 'string' }, valores: { type: 'array', items: { type: 'number' } } }, required: ['nombre', 'valores'] },
                },
                unidad: { type: 'string', description: 'Unidad de los valores (USD, kg, facturas…).' },
              },
              required: ['titulo', 'tipo', 'categorias', 'series'],
            },
          },
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
    // Contenido de entrenamiento: sin datos de negocio.
    permiso: null,
    tool: {
      name: 'consultar_academy',
      description:
        'Consulta Xmart Academy, el manual de Oben Xmart: cómo funciona cada módulo, el paso a paso, las reglas y el glosario. Úsala SIEMPRE que pregunten cómo se hace algo, para qué sirve una pantalla, qué significa un término o por qué el sistema hizo algo. Responde con lo que diga y ofrece ir a la lección o al módulo.',
      input_schema: {
        type: 'object',
        properties: {
          pregunta: { type: 'string', description: 'Lo que pregunta el usuario, con sus palabras.' },
          modulo: { type: 'string', description: 'Clave del módulo si ya la sabes (p. ej. facturacion, lista-empaque, facturas-parciales, comercial).' },
        },
        required: ['pregunta'],
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
    permiso: 'reports.create',
    tool: {
      name: 'generar_imagen',
      description:
        'Genera una imagen con IA (ilustraciones, piezas gráficas, fondos) y deja un botón para descargarla. Un modo inteligente escoge el modelo de mejor costo-beneficio según el nivel y respeta los topes de costo del tenant; cada imagen cuesta centavos. Solo úsala si el usuario la pide explícitamente. Describe la imagen en inglés para mejores resultados. No pongas texto ni logos reales en la imagen.',
      input_schema: {
        type: 'object',
        properties: {
          descripcion: { type: 'string', description: 'Qué debe mostrar la imagen (estilo, colores, composición).' },
          nivel: { type: 'string', enum: ['economico', 'estandar', 'alta'], description: 'Calidad. Por defecto economico.' },
        },
        required: ['descripcion'],
        additionalProperties: false,
      },
    },
  },
  {
    permiso: 'reports.create',
    tool: {
      name: 'generar_video',
      description:
        'Pide un video corto con IA (4 a 8 segundos, 720p, con audio). Un modo inteligente escoge el modelo de mejor costo-beneficio y verifica los topes de costo ANTES de gastar; un video económico de 6 segundos cuesta unos US$0,30. Es asíncrono: tarda cerca de un minuto, así que responde de inmediato con el costo estimado y dile al usuario que te pregunte "cómo va el video" para entregarlo (usa estado_video). Solo úsala si el usuario lo pide explícitamente. Describe la escena en inglés para mejores resultados; no pongas texto ni logos reales.',
      input_schema: {
        type: 'object',
        properties: {
          descripcion: { type: 'string', description: 'La escena: qué se ve, movimiento de cámara, ambiente y sonido.' },
          duracion: { type: 'integer', enum: [4, 6, 8], description: 'Segundos (por defecto 6).' },
          formato: { type: 'string', enum: ['16:9', '9:16'], description: 'Horizontal 16:9 (por defecto) o vertical 9:16.' },
          audio: { type: 'boolean', description: 'Con audio (por defecto sí).' },
          nivel: { type: 'string', enum: ['economico', 'estandar', 'alta'], description: 'Calidad. Por defecto economico.' },
        },
        required: ['descripcion'],
        additionalProperties: false,
      },
    },
  },
  {
    permiso: 'reports.create',
    tool: {
      name: 'estado_video',
      description: 'Revisa el video que el usuario pidió con generar_video: si ya terminó deja un botón para descargarlo y dice cuánto costó; si sigue en proceso, pídele que espere unos segundos más. Sin id usa el último video del usuario.',
      input_schema: { type: 'object', properties: { id: { type: 'string', description: 'Id devuelto por generar_video (opcional).' } }, additionalProperties: false },
    },
  },
  {
    permiso: 'reports.read',
    tool: {
      name: 'gasto_ia',
      description: 'Cuánto se ha gastado hoy y en el mes en imágenes y videos de IA, cuántos videos hay en proceso y cuáles son los topes de costo (por pedido, por día y por mes).',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
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
