import { ARANCEL_USA_PCT, PARTIDAS, arancelDestinoPct, familiaDe, partidaComun, partidaDe, tipoDeLinea } from './partidas-arancelarias';

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

  it('descripciones oficiales de la factura (Jorge, 5-oct): las tres que dio coinciden con la tabla', () => {
    expect(PARTIDAS.bopp).toMatchObject({ descripcionEs: 'PELICULA DE POLIPROPILENO BIORIENTADO', descripcionEn: 'BIORIENTED POLYPROPYLENE FILM' });
    expect(PARTIDAS.pet).toMatchObject({ descripcionEs: 'PELICULA DE POLIETILENO TEREFTALATO', descripcionEn: 'POLYETHYLENE-TEREPHTHALATE BIORIENTED FILM' });
    expect(PARTIDAS.pet_termoencogible).toMatchObject({ descripcionEs: 'PELICULA DE COPOLIESTER TERMOCONTRAIBLE', descripcionEn: 'POLYESTER FILM, HEAT-SHRINKABLE' });
  });

  it('arancel de importación (Jorge, 5-oct): 0 en destino, 12,5 % solo EE. UU.', () => {
    expect(arancelDestinoPct(false)).toBe(0);
    expect(arancelDestinoPct(true)).toBe(12.5);
    expect(ARANCEL_USA_PCT).toBe(12.5);
  });

  it('partida común: todas las líneas iguales; mezcla o desconocidas → ninguna', () => {
    expect(partidaComun(['SC---0030TN0405S0760', 'SC---0030TN0410S0760']).partida?.ncm).toBe('3920.20.19');
    expect(partidaComun(['SC---0030TN0405S0760', 'ENA--0012TM0902S0760'])).toMatchObject({ partida: null, sinPartida: ['ENA--0012TM0902S0760'] });
  });

  it.each([
    ['BOPP', 'CRISTAL', 'bopp'],
    ['BOPP', 'METALIZADO', 'bopp_metalizado'],
    ['bopet', null, 'pet'],
    ['PET-S', 'CRISTAL', 'pet_termoencogible'],
    ['', 'CRISTAL', null],
    [null, null, null],
  ])('Linea %j + TipoMaterial %j de Oben → %s', (linea, material, tipo) => {
    expect(tipoDeLinea(linea, material)).toBe(tipo);
  });

  it('con Linea de Oben ya no se adivina por la familia: ENA marcada BOPET es PET', () => {
    expect(partidaDe({ codigo: 'ENA--0012TM0902S0760', linea: 'BOPET', tipoMaterial: 'CRISTAL' })?.tipo).toBe('pet');
    expect(partidaDe({ codigo: 'SC---0020TN', linea: 'BOPP', tipoMaterial: 'METALIZADO' })?.descripcionEs).toContain('METALIZADO');
  });

  it('BOPP cristal y BOPP metalizado en la misma PF son mezcla (misma partida, distinta descripción)', () => {
    const r = partidaComun([
      { codigo: 'SC---0020TN', linea: 'BOPP', tipoMaterial: 'CRISTAL' },
      { codigo: 'SC---0030TN', linea: 'BOPP', tipoMaterial: 'METALIZADO' },
    ]);
    expect(r).toMatchObject({ partida: null, mezcla: true });
  });
});
