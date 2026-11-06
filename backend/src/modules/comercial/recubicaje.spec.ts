import { UMBRAL_RECUBICAJE_PCT, evaluarRecubicaje } from './recubicaje';

describe('recubicaje: más del 10 % en cualquier sentido es excepción', () => {
  const lineas = [{ n: 1, kilos: 1000 }, { n: 2, kilos: 500 }];

  it('el umbral es 10 %', () => {
    expect(UMBRAL_RECUBICAJE_PCT).toBe(10);
  });

  it('dentro del 10 % (sube o baja) no hay excepción', () => {
    const r = evaluarRecubicaje(lineas, [{ n: 1, kilos: 1100 }, { n: 2, kilos: 450 }]);
    expect(r.fuera).toEqual([]);
    expect(r.lineas.map((l) => l.pct)).toEqual([10, -10]);
  });

  it('cuando SUBE más del 10 % es excepción', () => {
    const r = evaluarRecubicaje(lineas, [{ n: 1, kilos: 1101 }]);
    expect(r.fuera).toEqual([{ n: 1, antes: 1000, despues: 1101, pct: 10.1 }]);
  });

  it('cuando BAJA más del 10 % es excepción', () => {
    const r = evaluarRecubicaje(lineas, [{ n: 2, kilos: 449 }]);
    expect(r.fuera).toEqual([{ n: 2, antes: 500, despues: 449, pct: -10.2 }]);
  });

  it('basta una línea fuera; las demás no cuentan', () => {
    const r = evaluarRecubicaje(lineas, [{ n: 1, kilos: 1000 }, { n: 2, kilos: 800 }]);
    expect(r.fuera.map((l) => l.n)).toEqual([2]);
  });

  it('rechaza líneas que no existen, kilos inválidos y líneas sin kilos de referencia', () => {
    expect(evaluarRecubicaje(lineas, [{ n: 9, kilos: 1 }]).error).toMatch(/No existe la línea 9/);
    expect(evaluarRecubicaje(lineas, [{ n: 1, kilos: -5 }]).error).toMatch(/mayor o igual a 0/);
    expect(evaluarRecubicaje([{ n: 1, kilos: null }], [{ n: 1, kilos: 5 }]).error).toMatch(/no tiene kilos/);
  });
});
