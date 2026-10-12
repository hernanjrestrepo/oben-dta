import type { CuadroIntegracionEntrada, CuadroIntegracionFuente, MaterialMaestro, TipoMaterial } from './cuadro-integracion.types';

/**
 * Fuente SIMULADA (WO-033): reproduce el certificado 51590 de Zona Franca (23-sep-2026, Oben Colombia) con los
 * archivos que Oben compartió el 12-oct. Existe hasta que José entregue las APIs de consumo por orden y los
 * maestros; nada de aquí se envía a ningún sistema real.
 */
const u = (valor: number, cantidad: number) => valor / cantidad;

function mp(
  referencia: string,
  descripcion: string,
  subpartida: string,
  pctDesperdicio: number,
  pctRegranulado: number,
  valor: number,
  cantidadCertificado: number,
): MaterialMaestro {
  return mat(referencia, descripcion, subpartida, 'MP', 'extranjero', 'KG', pctDesperdicio, pctRegranulado, 1, u(valor, cantidadCertificado));
}

function mat(
  referencia: string,
  descripcion: string,
  subpartida: string,
  tipo: TipoMaterial,
  origen: 'nacional' | 'extranjero',
  unidad: string,
  pctDesperdicio: number,
  pctRegranulado: number,
  kgPorUnidad: number | null,
  valorUnitUsd: number | null,
): MaterialMaestro {
  return { referencia, descripcion, subpartida, tipo, origen, unidad, pctDesperdicio, pctRegranulado, kgPorUnidad, valorUnitUsd, declaracion: null };
}

const MATERIALES: MaterialMaestro[] = [
  mp('69256-003', 'MASTERBATCH ANTIBLOCK ANTIFRICCIONANTE MBF410', '3902300000', 0.05, 0.105, 18.2093, 5.49),
  mp('78429-001', 'MASTERBATCH ANTIESTATICO DESLIZANTE MAASS15', '3902100000', 0.05, 0.105, 750.4725, 332.87),
  mp('66612-004', 'MASTERBATCH ANTIFRICCIONANTE MF405', '3902300000', 0.05, 0.105, 125.7397, 30.79),
  mp('70886-006', 'MASTERBATCH DESLIZANTE MSX205', '3902300000', 0.05, 0.105, 191.3218, 55.46),
  mp('81542-002', 'MASTERBATCH DESLIZANTE MSX405', '3902900000', 0.05, 0.105, 14.879, 3.8),
  mp('80934-001', 'COPOLIMERO ADSYL 5C 30F', '3902300000', 0.01, 0.105, 3377.969, 2179.61),
  mp('80444-001', 'POLIPROPILENO (PP 5231P 149)', '3902100000', 0, 0, 4542.8636, 4198.58),
  mp('80123-001', 'HOMOPOLIMERO (FF030F2)', '3902100000', 0.05, 0.105, 14260.7488, 11877.86),
  mp('76030-001', 'POLIPROPILENO (POLYPROPYLENE HOMOPOLYMER H3003-P)', '3902100000', 0.105, 0.105, 3539.0935, 4019.74),
  mp('77532-001', 'POLIPROPILENO (PP 521P 149)', '3902100000', 0, 0, 331.7474, 404.57),
  mp('C-51392-002', 'RECUPERADO PP CRISTAL', '3920209000', 0, 0, 1746.9016, 1545.93),
  mat('82250-002', 'ESQUINERO DE PLASTICO TEX Y RAN DE 155 CM', '3926909090', 'ME', 'extranjero', 'U', 0, 0, 23.56 / 200, u(50.7536, 200)),
  mat('71679-003', 'AGLOMERADO 765X800X18 EJE 6" (120X80X160)', '4410110000', 'ME', 'extranjero', 'M3', 0.015, 0, 1112.9865 / 2.09, u(730.3812, 2.09)),
  mat('C-51315-001', 'CONO REFORZADO DE 6" INHOUSE', '3926909090', 'ME', 'extranjero', 'U', 0, 0, 35.7067 / 160, u(52.9043, 160)),
  mat('61854-001', 'ZUNCHO PET 15.5 X 0.8-1200', '3920620090', 'ME', 'extranjero', 'KG', 0.08, 0, 1, u(52.1868, 26.42)),
  mat('68041-005', 'HS DE 18MM (MEDIANA-UNIDAD / BOLSA X 7.6 KG)', '3926909090', 'ME', 'extranjero', 'U', 0.02, 0, 5.1163 / 244.8, u(14.0917, 244.8)),
  mat('62415-001', 'PLASTICO STRETCH, C6 50 CMX 2276', '3920620010', 'ME', 'extranjero', 'KG', 0.05, 0, 1, u(13.8409, 3.8)),
  mat('70014-002', 'TUBO DE CARTON FC-3000-76.2-7.5MM CANT 150', '4822900000', 'ME', 'nacional', 'KG', 0.12, 0, 1, u(116.4908, 99.15)),
  mat('54487-003', 'ETIQUETA TERM, ADHE P, MEDIDAS 57X48 MM', '4821900000', 'ME', 'nacional', 'KG', 0.1, 0, 1, u(0.2318, 0.08)),
  mat('60398-001', 'ETIQUETA TRANSF TERM, ADHE. P, MEDIDAS 100X160MM', '4821900000', 'ME', 'nacional', 'KG', 0.1, 0, 1, u(1.3725, 0.07)),
  mat('60398-003', 'ETIQUETA TRANSF AZUL, ADHE. P, MEDIDAS 145X250MM', '4821900000', 'ME', 'nacional', 'KG', 0.1, 0, 1, u(1.7877, 0.05)),
  mat('83015-003', 'ESTIBA DE MADERA DE 770X850 ESTANDAR CANT 60', '4415200000', 'ME', 'nacional', 'U', 0, 0, 240 / 32, u(625.8129, 32)),
  mat('81409-003', 'ESTIBA DE MADERA DE 770X950 ESTANDAR CANT 60', '4415200000', 'ME', 'nacional', 'U', 0, 0, 128 / 8, u(128.1683, 8)),
];

/** Consumo real de la orden (hoja COSTOS OBEN del Excel base); el copolímero llega en tres lotes. */
const CONSUMOS: [string, number][] = [
  ['69256-003', 4.75],
  ['78429-001', 288.2],
  ['66612-004', 26.66],
  ['70886-006', 48.02],
  ['81542-002', 3.29],
  ['80934-001', 789.4],
  ['80934-001', 186.4],
  ['80934-001', 979.01],
  ['80444-001', 4198.58],
  ['80123-001', 10283.86],
  ['76030-001', 3322.1],
  ['77532-001', 404.57],
  ['C-51392-002', 1545.93],
  ['82250-002', 200],
  ['71679-003', 2.09],
  ['C-51315-001', 160],
  ['61854-001', 26.42],
  ['68041-005', 244.8],
  ['62415-001', 3.8],
  ['70014-002', 99.15],
  ['54487-003', 0.08],
  ['60398-001', 0.07],
  ['60398-003', 0.05],
  ['83015-003', 32],
  ['81409-003', 8],
];

export class CuadroIntegracionFuenteSimulada implements CuadroIntegracionFuente {
  readonly simulada = true;

  async obtener(orden: string): Promise<CuadroIntegracionEntrada | null> {
    if (!orden.trim()) return null;
    return {
      orden,
      destino: 'AL RESTO DEL MUNDO',
      productos: [
        { referencia: 'C-51590-001', descripcion: 'PELICULA DE POLIPROPILENO BIORIENTADO SC20', subpartida: '3920209000', cantidadKg: 22080.76, valorUsd: 55555.19 },
        { referencia: 'C-51590-002', descripcion: 'RECUPERADO PP CRISTAL', subpartida: '3920209000', cantidadKg: 1672.84, valorUsd: 1890.31 },
      ],
      consumos: CONSUMOS.map(([referencia, cantidad]) => ({ referencia, cantidad })),
      materiales: MATERIALES,
      otrosCostos: [
        { concepto: 'MANO DE OBRA', valorUsd: 312.98 },
        { concepto: 'GASTOS OPERATIVOS', valorUsd: 7169.04 },
        { concepto: 'UTILIDAD BRUTA', valorUsd: 19275.5113 },
      ],
    };
  }
}
