/**
 * Definiciones de las 5 herramientas en formato function-calling de Ollama
 * (campo `tools` del endpoint /api/chat). Compatible con Qwen2.5 y Llama 3.1,
 * ambos con soporte nativo de tool calling.
 *
 * Estas specs se envían al LLM; cuando el modelo decide invocar una tool,
 * EvaToolsService.executeTool() la ejecuta contra servicios reales.
 */
export const EVA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'GetClient',
      description:
        'Busca un cliente real por su código de negocio (ej. CLIENT-001) y devuelve su cupo de crédito disponible.',
      parameters: {
        type: 'object',
        properties: {
          clientId: {
            type: 'string',
            description: 'Código de negocio del cliente, ej. CLIENT-001',
          },
        },
        required: ['clientId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'GetProduct',
      description:
        'Busca un producto real por SKU y devuelve precio y stock disponible.',
      parameters: {
        type: 'object',
        properties: {
          sku: { type: 'string', description: 'SKU del producto, ej. SKU-001' },
        },
        required: ['sku'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ValidateCredit',
      description:
        'Valida el cupo de crédito del cliente contra el monto de una orden y registra la validación en la base de datos.',
      parameters: {
        type: 'object',
        properties: {
          clientId: {
            type: 'string',
            description: 'Código de negocio del cliente, ej. CLIENT-001',
          },
          orderAmount: {
            type: 'number',
            description: 'Monto total de la orden a validar',
          },
          orderId: {
            type: 'string',
            description: 'UUID de la orden si ya existe (opcional)',
          },
        },
        required: ['clientId', 'orderAmount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'CreateOrder',
      description:
        'Crea una orden real en PostgreSQL con sus items. Devuelve el orderId real persistido.',
      parameters: {
        type: 'object',
        properties: {
          clientId: {
            type: 'string',
            description: 'Código de negocio del cliente, ej. CLIENT-001',
          },
          items: {
            type: 'array',
            description: 'Lista de items de la orden',
            items: {
              type: 'object',
              properties: {
                sku: { type: 'string', description: 'SKU del producto' },
                qty: { type: 'number', description: 'Cantidad solicitada' },
              },
              required: ['sku', 'qty'],
            },
          },
          notes: {
            type: 'string',
            description: 'Notas opcionales de la orden',
          },
        },
        required: ['clientId', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'CreateInvoice',
      description:
        'Crea una factura real en PostgreSQL para una orden ya creada. Devuelve el invoiceId real persistido.',
      parameters: {
        type: 'object',
        properties: {
          orderId: {
            type: 'string',
            description: 'UUID de la orden a facturar',
          },
        },
        required: ['orderId'],
      },
    },
  },
] as const;

/**
 * Tools del Integration Hub (SOLO LECTURA). Set separado del flujo de órdenes
 * para no saturar el tool-list del modelo durante el order-to-cash.
 * Se inyectan cuando la consulta es sobre datos de ERP (proveedores, ítems,
 * órdenes de compra, recepciones, SuiteQL).
 */
export const EVA_INTEGRATION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'GetVendors',
      description: 'Lista proveedores desde VETA por fecha de importación (solo lectura).',
      parameters: {
        type: 'object',
        properties: { date: { type: 'string', description: 'Fecha YYYY-MM-DD' } },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'GetItems',
      description: 'Lista artículos desde VETA por fecha de importación (solo lectura).',
      parameters: {
        type: 'object',
        properties: { date: { type: 'string', description: 'Fecha YYYY-MM-DD' } },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'GetPurchaseOrders',
      description: 'Lista órdenes de compra desde VETA por fecha (solo lectura).',
      parameters: {
        type: 'object',
        properties: { date: { type: 'string', description: 'Fecha YYYY-MM-DD' } },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'GetReceipts',
      description: 'Lista recepciones de mercancía desde VETA por fecha o por número de OC (solo lectura).',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Fecha YYYY-MM-DD (opcional)' },
          poNumber: { type: 'string', description: 'Número de orden de compra (opcional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'RunSuiteQL',
      description: 'Ejecuta una consulta SuiteQL de SOLO LECTURA (SELECT) en NetSuite.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Consulta SuiteQL SELECT' } },
        required: ['query'],
      },
    },
  },
] as const;
