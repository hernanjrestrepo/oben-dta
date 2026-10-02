import { PARTIDAS, familiaDe, partidaComun, partidaDe } from './partidas-arancelarias';

describe('partidas arancelarias de Oben (2026-10-02)', () => {
  it('las 4 referencias entregadas por Oben', () => {
    expect(Object.values(PARTIDAS).map((p) => [p.tipo, p.ncm])).toEqual([
      ['bopp', '3920.20.19'],
      ['bopp_metalizado', '3920.20.19'],
      ['pet', '3920.62.19'],
      ['pet_termoencogible', '3920.62.00.20'],
    ]);
  });

  it.each([
    ['SC---0030TN0405S0760', 'SC'],
    ['SC15TN', 'SC'],
    ['ENA--0012TM0902S0760', 'ENA'],
    ['7709990480344', null],
  ])('familia de %s → %s', (codigo, familia) => expect(familiaDe(codigo)).toBe(familia));

  it('SC (OPP Seal Film, visto en la FEXP3190) es BOPP con su NALADI', () => {
    expect(partidaDe('SC---0030TN0405S0760')).toMatchObject({ ncm: '3920.20.19', naladi: '3920.20.10' });
  });

  it('una familia sin tipo confirmado (ENA) no se adivina', () => {
    expect(partidaDe('ENA--0012TM0902S0760')).toBeNull();
  });

  it('partida común: todas las líneas iguales; mezcla o desconocidas → ninguna', () => {
    expect(partidaComun(['SC---0030TN0405S0760', 'SC---0030TN0410S0760']).partida?.ncm).toBe('3920.20.19');
    expect(partidaComun(['SC---0030TN0405S0760', 'ENA--0012TM0902S0760'])).toMatchObject({ partida: null, sinPartida: ['ENA--0012TM0902S0760'] });
  });
});
