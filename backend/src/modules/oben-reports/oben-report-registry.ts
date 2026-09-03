export interface ObenReportDefinition {
  key: string;
  procedure: string;
  label: string;
}

/**
 * Los 7 reportes/documentos que Oben arma en `spXxx_Paradixe` sobre la misma
 * API genérica (`APIConsultaParadixe`, ver ObenCostOrderRealAdapter). No es
 * una lista inventada: son los stored procedures que Oben expuso el
 * 2026-08-24 (ver comentario en oben-cost-order.real.ts) más
 * spCheckSettlement_Paradixe, que José confirmó como parte del paquete de
 * documentos que se arma al insertar el último pallet. spPackingListUSA ya
 * tiene su propia pantalla dedicada (Lista de Empaque) — no se repite aquí.
 */
export const OBEN_REPORTS: ObenReportDefinition[] = [
  { key: 'consumo_me', procedure: 'spConsumoME_Paradixe', label: 'Consumo de Material de Empaque' },
  { key: 'consumo_mp', procedure: 'spConsumoMP_Paradixe', label: 'Consumo de Materia Prima' },
  { key: 'empaque_unificada', procedure: 'spEmpaqueUnificada_Paradixe', label: 'Lista de Empaque Unificada' },
  { key: 'empaque_detallada', procedure: 'spEmpaqueDetallada_Paradixe', label: 'Lista de Empaque Detallada' },
  { key: 'chec_linea', procedure: 'spChecLinea_Paradixe', label: 'Check Línea' },
  { key: 'empaque_solefilmes', procedure: 'spEmpaqueSolefilmes_Paradixe', label: 'Empaque Solefilmes' },
  { key: 'check_settlement', procedure: 'spCheckSettlement_Paradixe', label: 'Check Settlement' },
];

export function findObenReport(key: string): ObenReportDefinition | undefined {
  return OBEN_REPORTS.find((r) => r.key === key);
}
