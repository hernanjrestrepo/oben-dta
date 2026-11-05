/**
 * Coherencia de pesos de la Lista de Empaque Unificada (spEmpaqueUnificada_Paradixe).
 *
 * 5-nov-2026, OV 11314 (Gilpa): el 30-oct Oben devolvió una estiba con 1.169,36 kg netos y 952,00 kg brutos
 * (el neto no puede superar al bruto); la lista salió así, se facturaron 2.020,96 kg y la consulta de hoy da 883,60.
 * Oben Xmart copia lo que devuelve Oben, así que aquí se detecta lo imposible o lo que no suma, para avisarlo en el correo.
 */

type Fila = Record<string, unknown>;

const TOLERANCIA_KG = 0.05;
const MAX_POR_TIPO = 5;

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n =
    typeof v === 'number'
      ? v
      : Number(String(v as string | number).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const kg = (n: number): string =>
  n.toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function lista(items: string[]): string {
  const visibles = items.slice(0, MAX_POR_TIPO).join('; ');
  return items.length > MAX_POR_TIPO
    ? `${visibles}; y ${items.length - MAX_POR_TIPO} más`
    : visibles;
}

/** Avisos en lenguaje claro; vacío si los pesos son coherentes. */
export function validarPesosEmpaque(record: Record<string, unknown>): string[] {
  const detalle = Array.isArray(record.Detalle)
    ? (record.Detalle as Fila[])
    : [];
  if (detalle.length === 0) return [];
  const avisos: string[] = [];

  const netoMayor: string[] = [];
  const unidades: string[] = [];
  let sumaNeto = 0;
  let sumaBruto = 0;
  let sumaBobinas = 0;
  for (const p of detalle) {
    const neto = num(p.PesoNetoKg);
    const bruto = num(p.PesoBrutoKg);
    const netoLb = num(p.PesoNetoLb);
    const codigo =
      typeof p.CodigoPallet === 'string' || typeof p.CodigoPallet === 'number'
        ? String(p.CodigoPallet)
        : '?';
    if (neto !== null) sumaNeto += neto;
    if (bruto !== null) sumaBruto += bruto;
    sumaBobinas += num(p.Bobinas) ?? 0;
    if (neto !== null && bruto !== null && neto > bruto + 0.005) {
      netoMayor.push(
        `estiba ${codigo}: neto ${kg(neto)} kg mayor que el bruto ${kg(bruto)} kg`,
      );
    }
    if (
      neto !== null &&
      netoLb !== null &&
      Math.abs(netoLb - neto / 0.45359237) > 0.5
    ) {
      unidades.push(
        `estiba ${codigo}: ${kg(neto)} kg no equivale a ${kg(netoLb)} lb`,
      );
    }
  }
  if (netoMayor.length)
    avisos.push(
      `El peso neto es mayor que el bruto (imposible), revisar con Planeación: ${lista(netoMayor)}.`,
    );
  if (unidades.length)
    avisos.push(`El peso en kg y en libras no coincide: ${lista(unidades)}.`);

  const totalNeto = num(record.TotalPesoNetoKg);
  if (totalNeto !== null && Math.abs(totalNeto - sumaNeto) > TOLERANCIA_KG) {
    avisos.push(
      `El total neto que informa Oben (${kg(totalNeto)} kg) no coincide con la suma de las estibas (${kg(sumaNeto)} kg).`,
    );
  }
  const totalBruto = num(record.TotalPesoBrutoKg);
  if (totalBruto !== null && Math.abs(totalBruto - sumaBruto) > TOLERANCIA_KG) {
    avisos.push(
      `El total bruto que informa Oben (${kg(totalBruto)} kg) no coincide con la suma de las estibas (${kg(sumaBruto)} kg).`,
    );
  }
  const totalPallets = num(record.TotalPallet);
  if (totalPallets !== null && totalPallets !== detalle.length) {
    avisos.push(
      `Oben informa ${totalPallets} estibas pero el detalle trae ${detalle.length}.`,
    );
  }
  const totalBobinas = num(record.TotalBobinas);
  if (totalBobinas !== null && totalBobinas !== sumaBobinas) {
    avisos.push(
      `Oben informa ${totalBobinas} bobinas pero el detalle suma ${sumaBobinas}.`,
    );
  }
  return avisos;
}

/** Recuadro de advertencia para el correo de Lista de Empaque (vacío si no hay avisos). */
export function avisosPesosHtml(avisos?: string[]): string {
  if (!avisos?.length) return '';
  const esc = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    '<div style="border:1px solid #F47735;background:#FFF4EC;padding:8px 12px;margin-top:12px">' +
    '<p style="margin:0 0 4px"><b>Advertencia: los pesos de la Lista de Empaque no son coherentes.</b> ' +
    'Planeación debe confirmarlos antes de facturar.</p><ul style="margin:0">' +
    avisos.map((a) => `<li>${esc(a)}</li>`).join('') +
    '</ul></div>'
  );
}
