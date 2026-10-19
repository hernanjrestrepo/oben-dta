import { enteroEnLetras, integerInWords, valorEnLetras, valueInWords , totalesEnPesos } from './letras';

describe('valor en letras (como lo imprime Facture en las facturas de Oben)', () => {
  it('FV11363 real: 45.077.578 pesos', () => {
    expect(valorEnLetras(45077578, 'COP')).toBe('SON: CUARENTA Y CINCO MILLONES SETENTA Y SIETE MIL QUINIENTOS SETENTA Y OCHO PESOS');
    // El original dice "FOURTY": aquí va bien escrito.
    expect(valueInWords(45077578, 'COP')).toBe('ARE:  FORTY FIVE MILLION SEVENTY SEVEN THOUSAND FIVE HUNDRED SEVENTY EIGHT PESOS');
  });

  it('FEXP3190 real: 344.405,41 dólares', () => {
    expect(valorEnLetras(344405.41, 'USD')).toBe('SON: TRESCIENTOS CUARENTA Y CUATRO MIL CUATROCIENTOS CINCO DOLARES CON CUARENTA Y UNO CENTAVOS');
  });

  it.each([
    [100, 'CIEN'],
    [101, 'CIENTO UNO'],
    [21000, 'VEINTIUN MIL'],
    [1000, 'MIL'],
    [1000000, 'UN MILLON'],
    [31000000, 'TREINTA Y UN MILLONES'],
    [715, 'SETECIENTOS QUINCE'],
  ])('%d → %s', (n, letras) => expect(enteroEnLetras(n)).toBe(letras));

  it('millones exactos llevan "DE"', () => {
    expect(valorEnLetras(2000000, 'COP')).toBe('SON: DOS MILLONES DE PESOS');
  });

  it('inglés sin "AND" ni guiones', () => {
    expect(integerInWords(1190000)).toBe('ONE MILLION ONE HUNDRED NINETY THOUSAND');
  });
});

describe('totalesEnPesos (factura nacional en USD, modelo FV-242518 de José, 19-oct)', () => {
  it('reproduce al pie de la letra las OBSERVACIONES de la FV-242518 (TRM 3174.67)', () => {
    expect(
      totalesEnPesos(
        [
          ['SUBTOTAL', 10028.02],
          // El IVA de las observaciones es la SUMA del IVA de cada ítem (536.63+523.43+219.21+131.67+494.39 = 1905.33),
          // no el del pie de factura (1905.32 = 19 % del subtotal redondeado).
          ['IVA', 1905.33],
          ['RETEIVA', 285.8],
          ['TOTAL', 11647.55],
        ],
        3174.67,
      ),
    ).toEqual([
      'SUBTOTAL 31835654.2534 COP - TREINTA Y UNO MILLONES  OCHOCIENTOS TREINTA Y CINCO MIL SEISCIENTOS CINCUENTA Y CUATRO CON 25/100 COP',
      'IVA 6048793.9911 COP - SEIS MILLONES  CUARENTA Y OCHO MIL SETECIENTOS NOVENTA Y TRES CON 99/100 COP',
      'RETEIVA 907320.6860 COP - NOVECIENTOS SIETE MIL TRESCIENTOS VEINTE CON 69/100 COP',
      'TOTAL 36977127.5585 COP - TREINTA Y SEIS MILLONES  NOVECIENTOS SETENTA Y SIETE MIL CIENTO VEINTISIETE CON 56/100 COP',
    ]);
  });

  it('un concepto en 0 no se escribe', () => {
    expect(totalesEnPesos([['SUBTOTAL', 100], ['RETEIVA', 0]], 4000)).toEqual(['SUBTOTAL 400000.0000 COP - CUATROCIENTOS MIL CON 00/100 COP']);
  });
});
