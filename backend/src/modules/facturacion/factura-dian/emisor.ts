/**
 * Datos de Oben Colombia S.A.S. tal como salen en sus facturas electrónicas
 * reales (FV11363 del 2026-07-27 y FEXP3190 del 2026-09-30, generadas por
 * Facture SAS / PL-Colab). Cuando Oben cambie de resolución DIAN se actualiza
 * aquí (y `vigenteHasta` avisa en el borrador si la resolución ya venció).
 */
export const EMISOR_OBEN = {
  razonSocial: 'OBEN COLOMBIA S.A.S.',
  nit: '901046830 - 3',
  nitSinDv: '901046830',
  direccion: 'ZF ZOFIA KM 114 V COR MZ 20 LT 318',
  ciudad: 'GALAPA Atlántico',
  telefono: '3102720079',
  correo: 'fe-oppfilm@obengroup.com',
  regimen: [
    'REGIMEN COMUN',
    'ACTIVIDAD ECONOMICA 2221',
    'NO SOMOS AUTORRETENEDORES',
    'SOMOS GRANDES CONTRIBUYENTES',
  ],
  agenteIca: 'Somos agentes de retención de ica actividad 2221 tarifa 7*1000',
  proveedorTecnologico: 'Facture SAS Nit: 900399741-7, Proveedor tecnológico. Software: PL-Colab',
  /** Cuenta para pagos en dólares (pie de la factura de exportación; el original salta de línea antes de "COD SWIFT"). */
  cuentaExportacion:
    'CUENTA:80110002051 - BANCOLOMBIA PANAMA  -\nCOD SWIFT  COLOPAPAXXX PANAMA - REPUBLICA DE PANAMA -  CONDICION DE ENVIO DE TRANSFERENCIA  SHA',
  medioPago: 'Consignación bancaria',
  formaPago: 'Crédito',
} as const;

export interface ResolucionDian {
  numero: string;
  /** Fecha de la resolución (también es la que Facture imprime como "FECHA VALIDACION DIAN"). */
  fecha: string;
  vigenteDesde: string;
  vigenteHasta: string;
  prefijo: string;
  desde: number;
  hasta: number;
}

export const RESOLUCIONES_DIAN: Record<'nacional' | 'exportacion', ResolucionDian> = {
  nacional: { numero: '18764088623254', fecha: '2025-02-10', vigenteDesde: '2025-02-10', vigenteHasta: '2026-08-10', prefijo: 'FV', desde: 5000, hasta: 20000 },
  exportacion: { numero: '18764113738043', fecha: '2026-08-06', vigenteDesde: '2026-08-06', vigenteHasta: '2028-02-06', prefijo: 'FEXP', desde: 3124, hasta: 5000 },
};

/** Texto legal de la factura nacional (art. 884 del Código de Comercio), con los mismos cortes de línea del original. */
export const TEXTO_LEGAL_NACIONAL = [
  'ESTA FACTURA DE VENTA A PARTIR DE SU VENCIMIENTO CAUSARA INTERESES DE MORA A LA TASA MAXIMA PERMITIDA POR LA LEY, SOBRE LA SUMA CORRESPONDIENTE A',
  'CAPITAL O SALDO INSOLUTO DE CONFORMIDAD CON EL ART. 884 DEL CODIGO DE COMERCIO Y LA RESOLUCIÓN DE LA SUPERINTENDENCIA FINANCIERA DE COLOMBIA.',
  'SE HACE CONSTAR QUE LA FIRMA DE PERSONA DISTINTA DEL COMPRADOR IMPLICA QUE DICHA PERSONA ESTA AUTORIZADA EXPRESAMENTE POR EL COMPRADOR PARA FIRMAR, RECONOCER LA DEUDA Y OBLIGAR',
  'AL COMPRADOR.',
];

/** Nombre comercial por familia de película (código de Oben), visto en facturas reales. */
export const FAMILIA_PELICULA: Record<string, string> = {
  SC: 'OPP SEAL FILM',
};
