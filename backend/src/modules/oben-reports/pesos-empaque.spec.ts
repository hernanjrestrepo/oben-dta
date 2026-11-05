import { avisosPesosHtml, validarPesosEmpaque } from './pesos-empaque';

const pallet = (codigo: string, neto: number, bruto: number, bobinas = 2) => ({
  CodigoPallet: codigo,
  PesoNetoKg: neto,
  PesoNetoLb: Math.round((neto / 0.45359237) * 100) / 100,
  PesoBrutoKg: bruto,
  Bobinas: bobinas,
});

describe('validarPesosEmpaque', () => {
  it('no avisa con pesos coherentes (OV 11314 tal como devuelve Oben hoy)', () => {
    const detalle = [pallet('A', 851.6, 913.2), pallet('B', 883.6, 952)];
    expect(
      validarPesosEmpaque({
        Detalle: detalle,
        TotalPesoNetoKg: 1735.2,
        TotalPesoBrutoKg: 1865.2,
        TotalPallet: 2,
        TotalBobinas: 4,
      }),
    ).toEqual([]);
  });

  it('detecta el neto mayor que el bruto del 30-oct (1.169,36 vs 952,00)', () => {
    const avisos = validarPesosEmpaque({
      Detalle: [
        pallet('A', 851.6, 913.2),
        pallet('26A29C3201369197', 1169.36, 952),
      ],
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/neto es mayor que el bruto/);
    expect(avisos[0]).toContain('26A29C3201369197');
  });

  it('avisa si el total de Oben no suma las estibas, las estibas o las bobinas', () => {
    const avisos = validarPesosEmpaque({
      Detalle: [pallet('A', 100, 110), pallet('B', 100, 110)],
      TotalPesoNetoKg: 250,
      TotalPesoBrutoKg: 220,
      TotalPallet: 3,
      TotalBobinas: 5,
    });
    expect(avisos.join(' ')).toMatch(/total neto/);
    expect(avisos.join(' ')).toMatch(/3 estibas/);
    expect(avisos.join(' ')).toMatch(/5 bobinas/);
    expect(avisos.join(' ')).not.toMatch(/total bruto/);
  });

  it('avisa si kg y libras no son la misma cantidad y resume cuando son muchas', () => {
    const malas = Array.from({ length: 7 }, (_, i) => ({
      ...pallet(`P${i}`, 500, 400),
    }));
    const [aviso] = validarPesosEmpaque({ Detalle: malas });
    expect(aviso).toMatch(/y 2 más/);
    expect(
      validarPesosEmpaque({
        Detalle: [{ ...pallet('A', 100, 110), PesoNetoLb: 500 }],
      })[0],
    ).toMatch(/libras/);
  });

  it('sin detalle no hay nada que validar', () => {
    expect(validarPesosEmpaque({})).toEqual([]);
  });
});

describe('avisosPesosHtml', () => {
  it('vacío sin avisos y con el recuadro y el texto escapado si los hay', () => {
    expect(avisosPesosHtml([])).toBe('');
    expect(avisosPesosHtml(['a < b'])).toContain('a &lt; b');
  });
});
