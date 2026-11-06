import { codigoPeliculaEspecialidad, cubicarAMano, esEspecialidad, ESPECIALIDADES, lineasParaCubicarAMano } from './cubicacion-nacional';

describe('cubicación de proformas nacionales (6-nov)', () => {
  it('la lista de la captura tiene sus 22 filas y los códigos de Oben (BOPET ETi TN 12 → ET---0012TN)', () => {
    expect(ESPECIALIDADES).toHaveLength(22);
    expect(codigoPeliculaEspecialidad(ESPECIALIDADES[0])).toBe('ET---0012TN');
    expect(codigoPeliculaEspecialidad(ESPECIALIDADES[8])).toBe('BC---0017TN');
  });

  it('una especialidad se cubica a mano aunque pese poco o mucho', () => {
    expect(esEspecialidad('ET---0012TN')).toBe(true);
    expect(cubicarAMano({ codigoOben: 'ET---0012TN', kilos: 9000 })).toBe(true);
  });

  it('no especialidad: menos de 4.000 kg a mano; a partir de 4.000 kg se cubica sola', () => {
    expect(cubicarAMano({ codigoOben: 'ET---0012RT', kilos: 3999 })).toBe(true);
    expect(cubicarAMano({ codigoOben: 'ET---0012RT', kilos: 4000 })).toBe(false);
  });

  it('en claro, qué línea y por qué', () => {
    expect(lineasParaCubicarAMano([
      { n: 1, codigoOben: 'ET---0012TN', kilos: 9000 },
      { n: 2, codigoOben: 'ET---0012RT', kilos: 5000 },
    ])).toEqual(['Línea 1 (ET---0012TN): especialidad']);
  });
});
