/**
 * APIs del flujo comercial de Oben (Excel "APIs Comercial Paradixe", versión del 20-oct con la columna API llena).
 * Probadas en vivo el 20-oct: hoy solo existen en el servidor de PRUEBAS de Oben (192.168.20.12:9098); en
 * api.obengroup.co dan 404. Por orden de Hernán ("conéctalas apuntando a pruebas") se usan las de pruebas; el
 * día que Oben las pase a producción basta poner `comercialUrl` en la configuración del tenant.
 *
 * Solo CONSULTAS. Las 4 escrituras (encabezado y detalle de proforma, crear y activar OV) existen en pruebas
 * pero no se conectan hasta tener un ejemplo de respuesta de José.
 */
export const COMERCIAL_URL_PRUEBAS = 'http://192.168.20.12:9098/api/External';

export type MaestroComercial = 'clientes' | 'productos' | 'partidas' | 'ciudades' | 'validarEmpaque' | 'parametrizacion';

export const APIS_COMERCIALES: Record<MaestroComercial, { api: string; parametros: Record<string, string>; descripcion: string }> = {
  clientes: { api: 'APICustomerParadixe', parametros: {}, descripcion: 'Maestro de clientes' },
  productos: { api: 'APIProductParadixe', parametros: {}, descripcion: 'Maestro de referencias' },
  partidas: { api: 'APITariffDepartureParadixe', parametros: {}, descripcion: 'Maestro de partidas arancelarias' },
  // El Excel dice "APICityStateCountry"; la que existe es con sufijo Paradixe (probado el 20-oct).
  ciudades: { api: 'APICityStateCountryParadixe', parametros: {}, descripcion: 'Maestro de ciudades, estados y países' },
  validarEmpaque: {
    api: 'APIValidProductMasterEmpaqueParadixe',
    parametros: { codSecEntity: 'CodSecEntity', codSecEntityAddress: 'CodSecEntityAddress', codSecProduct: 'CodSecProduct', codSecCity: 'CodSecCity' },
    descripcion: 'Valida que la referencia tenga Maestro de Empaque para el cliente y su destino',
  },
  // TargetCustomer = campo Target_Customer del maestro de clientes (José, 22-oct; antes se llamaba Cliente_Destino).
  parametrizacion: {
    api: 'APICustomerParameterizationParadixe',
    parametros: { codSecEntity: 'CodSecEntity', targetCustomer: 'TargetCustomer' },
    descripcion: 'Datos parametrizados por comercial para el cliente origen y el cliente destino',
  },
};

export function esMaestroComercial(v: unknown): v is MaestroComercial {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(APIS_COMERCIALES, v);
}

/**
 * Escrituras del flujo comercial, probadas en PRUEBAS el 22-oct (PF 13392: encabezado → detalle → OV → activada).
 * Todas responden HTTP 200 aunque rechacen: el éxito es el cuerpo "OK" (o el número del encabezado); cualquier
 * otro texto es el motivo del rechazo (p. ej. "No existe Lead Time Production para la pelicula FCH--0030TN…").
 */
export type EscrituraComercial = 'encabezado' | 'detalle' | 'ov' | 'activar';

export const ESCRITURAS_COMERCIALES: Record<EscrituraComercial, { api: string; parametros: string[] }> = {
  encabezado: {
    api: 'APISalesOrderHeadPFParadixe',
    parametros: [
      'CodSecEntity', 'CodSecComercialCondition', 'PurchaseOrder', 'Notes', 'DeliveryDate', 'ShipmentDate', 'From', 'To', 'Container', 'SubTotal', 'IVA',
      'ReteFuente', 'ReteIVA', 'Total', 'CodSecIncoterm', 'Export', 'CodSecCity', 'NoteSalesOrderPF', 'NoteConsigned', 'CodSecCurrency', 'DestinationPort',
      'GrossWeight', 'CodSecEtiquetaPallet', 'CodSecEtiquetaBobina', 'Paperwork', 'CodSedCustomerAddress', 'InvoiceMonth', 'Sample',
      'CodSecCityDestinationPort', 'OperationNotes', 'CodSecShippingTypeSample', 'SpecialNotes', 'NoteNotified', 'RequestDateCustomer', 'Stock',
    ],
  },
  detalle: {
    api: 'APISalesOrderDetailPFParadixe',
    parametros: ['CodSecSalesOrderHeadPF', 'CodSecProduct', 'Quantity', 'Price', 'ObservationLabel', 'PartNumber', 'CodSecTariff', 'CodSecEntity', 'CodSecEntityAddress', 'CodSecCity'],
  },
  ov: { api: 'APISalesOrderOVParadixe', parametros: ['CodSecSalesOrderHeadPF'] },
  activar: { api: 'APIActivateOVParadixe', parametros: ['CodSecSalesOrderHeadPF'] },
};

export function esEscrituraComercial(v: unknown): v is EscrituraComercial {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ESCRITURAS_COMERCIALES, v);
}

/** Valor de encabezado HTTP: sin saltos de línea ni caracteres fuera de latin-1 (las notas de Oben traen saltos de línea). */
export function valorEncabezado(v: unknown): string {
  return Array.from(String(v ?? ''))
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) > 255 ? ' ' : ch))
    .join('');
}

/**
 * Interpreta la respuesta de una escritura. El encabezado devuelve, desde el 22-oct (cambio de José),
 * "CodSec_SalesOrderHeadPF: 13393; Number PF: 11600":
 *  - CodSec_SalesOrderHeadPF = código INTERNO del encabezado (lo piden el detalle, la OV y la activación);
 *  - Number PF = el número OFICIAL de la proforma, con el que Comercial y todos hacen seguimiento.
 * (Antes solo devolvía el código interno: se sigue aceptando, sin número oficial.) Las demás escrituras: "OK".
 * Si no es así, lanza BUSINESS_ERROR con el texto de Oben.
 */
export function resultadoEscritura(
  paso: EscrituraComercial,
  data: unknown,
): { ok: true; codigoInterno?: number; numeroPF?: string | null; ordenVenta?: number } {
  const crudo = typeof data === 'string' || typeof data === 'number' ? String(data) : JSON.stringify(data ?? '');
  const texto = crudo.trim().replace(/^"|"$/g, '').trim();
  if (paso === 'encabezado') {
    const interno = texto.match(/CodSec_?SalesOrderHeadPF\s*:\s*(\d+)/i);
    if (interno && Number(interno[1]) > 0) {
      const oficial = texto.match(/Number\s*_?PF\s*:\s*([A-Za-z0-9-]+)/i);
      return { ok: true, codigoInterno: Number(interno[1]), numeroPF: oficial ? oficial[1] : null };
    }
    if (/^\d+$/.test(texto) && Number(texto) > 0) return { ok: true, codigoInterno: Number(texto), numeroPF: null };
  } else if (/^ok$/i.test(texto)) {
    return { ok: true };
  } else if (paso === 'ov') {
    // Hoy responde "OK" a secas; si Oben agrega el número de la orden de venta (como hizo con el encabezado), se toma.
    const ov = texto.match(/(?:Number\s*_?OV|Number\s*_?Order\s*_?Sales|N(?:ro|[uú]mero)\.?\s*(?:de\s*)?(?:la\s*)?(?:orden\s*de\s*venta|OV))\s*:\s*(\d+)/i);
    if (ov && Number(ov[1]) > 0) return { ok: true, ordenVenta: Number(ov[1]) };
  }
  throw new Error(`BUSINESS_ERROR: ${texto || 'Oben no devolvió respuesta'}`);
}
