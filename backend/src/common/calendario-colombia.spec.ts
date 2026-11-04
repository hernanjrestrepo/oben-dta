import { esHabil, festivosDe, habilAnteriorOIgual, restarDiasHabiles } from './calendario-colombia';

describe('calendario de festivos de Colombia', () => {
  it('festivos 2026 (Ley Emiliani + Semana Santa del 5 de abril)', () => {
    expect(festivosDe(2026).map((f) => f.fecha)).toEqual([
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-18', '2026-06-08', '2026-06-15',
      '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
    ]);
  });

  it('festivos 2027 (Pascua el 28 de marzo)', () => {
    const f = festivosDe(2027).map((x) => x.fecha);
    expect(f).toContain('2027-03-25'); // Jueves Santo
    expect(f).toContain('2027-03-26'); // Viernes Santo
    expect(f).toContain('2027-01-11'); // Reyes pasa al lunes
    expect(f).toContain('2027-05-10'); // Ascensión
    expect(f.length).toBe(18);
  });

  it('esHabil: sábados, domingos y festivos no', () => {
    expect(esHabil('2026-12-18')).toBe(true); // viernes
    expect(esHabil('2026-12-19')).toBe(false); // sábado
    expect(esHabil('2026-12-20')).toBe(false); // domingo
    expect(esHabil('2026-12-08')).toBe(false); // Inmaculada
    expect(esHabil('2026-12-25')).toBe(false); // Navidad
  });

  it('restarDiasHabiles salta fines de semana y festivos', () => {
    expect(restarDiasHabiles('2026-12-18', 3)).toBe('2026-12-15'); // vie 18 → jue 17, mié 16, mar 15
    expect(restarDiasHabiles('2026-12-18', 5)).toBe('2026-12-11'); // vie 11 (cinco hábiles atrás)
    expect(restarDiasHabiles('2026-12-09', 2)).toBe('2026-12-04'); // el 8 es festivo: mar 8 no cuenta; 9 → vie 4
    expect(restarDiasHabiles('2026-12-18', 0)).toBe('2026-12-18');
  });

  it('si la fecha de partida no es hábil, baja al hábil anterior', () => {
    expect(habilAnteriorOIgual('2026-12-20')).toBe('2026-12-18'); // domingo → viernes
    expect(restarDiasHabiles('2026-12-20', 1)).toBe('2026-12-17');
    expect(habilAnteriorOIgual('2027-03-28')).toBe('2027-03-24'); // domingo de Pascua → miércoles previo al Jueves Santo
  });
});

import { restarDiasCalendario } from './calendario-colombia';

describe('restarDiasCalendario', () => {
  it('resta días corridos, sin saltar fines de semana', () => {
    expect(restarDiasCalendario('2027-01-13', 25)).toBe('2026-12-19');
    expect(restarDiasCalendario('2026-12-18', 0)).toBe('2026-12-18');
  });
});
