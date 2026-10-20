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
  // Responde 400 con cualquier valor probado (20-oct): falta que José diga qué va en TargetCustomer.
  parametrizacion: {
    api: 'APICustomerParameterizationParadixe',
    parametros: { codSecEntity: 'CodSecEntity', targetCustomer: 'TargetCustomer' },
    descripcion: 'Datos parametrizados por comercial para el cliente origen y el cliente destino',
  },
};

export function esMaestroComercial(v: unknown): v is MaestroComercial {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(APIS_COMERCIALES, v);
}
