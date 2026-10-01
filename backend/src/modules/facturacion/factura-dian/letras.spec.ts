import { enteroEnLetras, integerInWords, valorEnLetras, valueInWords } from './letras';

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
