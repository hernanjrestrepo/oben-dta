import { avisosLimitesProforma, topePesoNeto } from './limites-proforma';

describe('topePesoNeto', () => {
  it('es el bruto del país de la tabla menos 2.000 kg (sin importar acentos ni mayúsculas)', () => {
    expect(topePesoNeto('Colombia')).toEqual({ netoMaxKg: 28000, brutoMaxKg: 30000, origen: 'tabla' });
    expect(topePesoNeto('España')?.netoMaxKg).toBe(22000);
    expect(topePesoNeto('República Dominicana')?.netoMaxKg).toBe(22000);
    expect(topePesoNeto('PERU')?.netoMaxKg).toBe(25000);
  });

  it('un país fuera de la tabla (Estados Unidos) usa el Peso_Bruto_Maximo de OBEN MAS', () => {
    expect(topePesoNeto('ESTADOS UNIDOS', 21000)).toEqual({ netoMaxKg: 19000, brutoMaxKg: 21000, origen: 'oben' });
    expect(topePesoNeto('ESTADOS UNIDOS')).toBeNull();
    expect(topePesoNeto('ESTADOS UNIDOS', 0)).toBeNull();
  });
});

describe('avisosLimitesProforma', () => {
  const linea = (linea: string, referencia: string) => ({ linea, referencia });

  it('sin avisos cuando cumple peso y SKU', () => {
    expect(avisosLimitesProforma({ pais: 'COLOMBIA', kilosNetos: 28000, lineas: [linea('BOPP', 'SC---0030TN'), linea('BOPP', 'SC---0035TN')] })).toEqual([]);
  });

  it('avisa si los kilos netos pasan el bruto del país menos 2.000', () => {
    const [aviso] = avisosLimitesProforma({ pais: 'ECUADOR', kilosNetos: 24500, lineas: [] });
    expect(aviso).toMatch(/superan el máximo por proforma para ECUADOR/);
    expect(aviso).toContain('24.000');
  });

  it('avisa si no hay forma de saber el tope', () => {
    expect(avisosLimitesProforma({ pais: 'ESTADOS UNIDOS', kilosNetos: 100, lineas: [] })[0]).toMatch(/No hay peso bruto máximo/);
  });

  it('cuenta SKU por producto completo: 3 micrajes distintos son 3 SKU y a partir del quinto avisa', () => {
    const cuatro = ['0020', '0025', '0030', '0035'].map((m) => linea('BOPP', `SC---${m}TN`));
    expect(avisosLimitesProforma({ pais: 'COLOMBIA', kilosNetos: 1, lineas: cuatro })).toEqual([]);
    const cinco = [...cuatro, linea('BOPP', 'SC---0040TN')];
    expect(avisosLimitesProforma({ pais: 'COLOMBIA', kilosNetos: 1, lineas: cinco })[0]).toMatch(/BOPP trae 5 SKU/);
  });

  it('el límite es por línea de película y un mismo SKU repetido cuenta una vez', () => {
    const lineas = [
      ...['0020', '0025', '0030', '0035'].map((m) => linea('BOPP', `SC---${m}TN`)),
      linea('BOPP', 'SC---0035TN'),
      linea('BOPET', 'ET---0012RT'),
    ];
    expect(avisosLimitesProforma({ pais: 'COLOMBIA', kilosNetos: 1, lineas })).toEqual([]);
  });
});
