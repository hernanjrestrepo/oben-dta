import { valorEncabezado } from './oben-comercial';

describe('valorEncabezado (Oben lee los números con coma decimal)', () => {
  it('el precio 2.5 va como "2,5" (con punto, Oben lo leía como 25)', () => {
    expect(valorEncabezado(2.5)).toBe('2,5');
    expect(valorEncabezado(7137.27)).toBe('7137,27');
  });
  it('enteros, textos y vacíos quedan igual', () => {
    expect(valorEncabezado(4700)).toBe('4700');
    expect(valorEncabezado('2026-12-18T10:05:24')).toBe('2026-12-18T10:05:24');
    expect(valorEncabezado('')).toBe('');
    expect(valorEncabezado(null)).toBe('');
  });
});
