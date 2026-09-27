/**
 * Cómo cuenta un correo de dónde salieron los datos de Oben: si vinieron del
 * simulador (obenCostOrder en modo mock, entorno de pruebas) NUNCA puede
 * decir "sistema real" — el asunto lleva [SIMULADO] y el cuerpo lo aclara.
 */
export function origenDatosOben(simulado: boolean): { prefijoAsunto: string; frase: string } {
  return simulado
    ? { prefijoAsunto: '[SIMULADO] ', frase: 'con datos del SIMULADOR de Oben (entorno de pruebas), no con datos reales' }
    : { prefijoAsunto: '', frase: 'con datos consultados en vivo al sistema real de Oben' };
}
