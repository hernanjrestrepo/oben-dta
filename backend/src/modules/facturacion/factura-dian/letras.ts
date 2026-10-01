/**
 * Valor en letras de la factura, como lo imprime Facture en las facturas de
 * Oben: "SON: CUARENTA Y CINCO MILLONES ... PESOS" / "ARE: FORTY FIVE
 * MILLION ... PESOS" (nacional) y "SON: ... DOLARES CON CUARENTA Y UNO
 * CENTAVOS" (exportación). Mayúsculas, sin tildes, sin "AND" ni guiones.
 */

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DIEZ_A_VEINTINUEVE = [
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

/** 0..999 en letras; `apocope` = "UN"/"VEINTIUN" delante de MIL/MILLONES. */
function centenasEs(n: number, apocope = false): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (r >= 10 && r < 30) partes.push(DIEZ_A_VEINTINUEVE[r - 10]);
  else if (r >= 30) partes.push(DECENAS[Math.floor(r / 10)] + (r % 10 ? ` Y ${UNIDADES[r % 10]}` : ''));
  else if (r > 0) partes.push(UNIDADES[r]);
  let s = partes.join(' ');
  if (apocope) s = s.replace(/VEINTIUNO$/, 'VEINTIUN').replace(/UNO$/, 'UN');
  return s;
}

/** Entero en letras (español). */
export function enteroEnLetras(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLON' : `${enteroEnLetras(millones).replace(/UNO$/, 'UN')} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${centenasEs(miles, true)} MIL`);
  if (resto) partes.push(centenasEs(resto));
  return partes.join(' ');
}

const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

function hundredsEn(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (h) partes.push(`${ONES[h]} HUNDRED`);
  if (r >= 20) partes.push(TENS[Math.floor(r / 10)] + (r % 10 ? ` ${ONES[r % 10]}` : ''));
  else if (r > 0) partes.push(ONES[r]);
  return partes.join(' ');
}

/** Entero en letras (inglés). */
export function integerInWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'ZERO';
  const scales: Array<[number, string]> = [[1_000_000_000, 'BILLION'], [1_000_000, 'MILLION'], [1000, 'THOUSAND']];
  const partes: string[] = [];
  let r = n;
  for (const [v, name] of scales) {
    if (r >= v) {
      partes.push(`${hundredsEn(Math.floor(r / v))} ${name}`);
      r %= v;
    }
  }
  if (r) partes.push(hundredsEn(r));
  return partes.join(' ');
}

const partes = (valor: number) => {
  const centavos = Math.round(Math.abs(valor) * 100);
  return { entero: Math.floor(centavos / 100), centavos: centavos % 100 };
};

/** "SON: ... PESOS" / "SON: ... DOLARES CON ... CENTAVOS". */
export function valorEnLetras(valor: number, moneda: 'COP' | 'USD'): string {
  const { entero, centavos } = partes(valor);
  const nombre = moneda === 'COP' ? 'PESOS' : 'DOLARES';
  // "UN MILLON DE PESOS": la preposición va cuando el monto termina en millones exactos.
  const de = entero % 1_000_000 === 0 && entero > 0 ? ' DE' : '';
  const base = `SON: ${enteroEnLetras(entero)}${de} ${nombre}`;
  return centavos ? `${base} CON ${enteroEnLetras(centavos)} CENTAVOS` : base;
}

/** "ARE: ... PESOS" (la factura nacional repite el valor en inglés). */
export function valueInWords(valor: number, moneda: 'COP' | 'USD'): string {
  const { entero, centavos } = partes(valor);
  const base = `ARE:  ${integerInWords(entero)} ${moneda === 'COP' ? 'PESOS' : 'DOLLARS'}`;
  return centavos ? `${base} AND ${integerInWords(centavos)} CENTS` : base;
}
