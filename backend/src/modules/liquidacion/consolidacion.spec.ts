import { contenedoresDelEnvio, repartirPorPeso } from './consolidacion';

describe('liquidación consolidada: reparto por peso (6-nov)', () => {
  const pfs = [
    { numberPF: '11673', kilos: 15000 },
    { numberPF: '11582', kilos: 7000 },
    { numberPF: '11694', kilos: 3333.33 },
  ];

  it('cada PF paga su parte del peso y la suma da exactamente el total (los centavos van a la última)', () => {
    const r = repartirPorPeso(pfs, { flete: 2730, inlandFreight: null, entryFee: 120, importerSecurityFiling: 45, otrosGastos: 1000.01 });
    const total = 25333.33;
    expect(r[0].flete).toBeCloseTo((2730 * 15000) / total, 1);
    expect(r[1].flete).toBeCloseTo((2730 * 7000) / total, 1);
    expect(Math.round(r.reduce((a, x) => a + (x.flete ?? 0), 0) * 100) / 100).toBe(2730);
    expect(Math.round(r.reduce((a, x) => a + (x.otrosGastos ?? 0), 0) * 100) / 100).toBe(1000.01);
    expect(Math.round(r.reduce((a, x) => a + (x.entryFee ?? 0), 0) * 100) / 100).toBe(120);
    expect(r.reduce((a, x) => a + x.participacion, 0)).toBeCloseTo(1, 10);
    expect(r[0].inlandFreight).toBeNull();
  });

  it('los contenedores se calculan con el peso de todo el envío (26.000 kg netos por contenedor de 40\')', () => {
    expect(contenedoresDelEnvio(25333.33)).toBe(1);
    expect(contenedoresDelEnvio(26000.01)).toBe(2);
    expect(contenedoresDelEnvio(0)).toBe(1);
  });

  it('sin kilos no se puede repartir', () => {
    expect(() => repartirPorPeso([{ numberPF: '1', kilos: 0 }], { flete: 1, inlandFreight: null, entryFee: null, importerSecurityFiling: null, otrosGastos: null })).toThrow(/no tienen kilos/);
  });
});
