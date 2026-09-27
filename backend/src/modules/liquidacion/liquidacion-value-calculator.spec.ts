import {
  LIQUIDACION_SIMULATION_ENV,
  PendingFormulaCalculator,
  SimulatedIncotermCalculator,
  calculatorFromEnv,
  type LiquidacionLineContext,
} from './liquidacion-value-calculator';

const USA_HEADER = { inlandFreight: 900, entryFee: 110, importerSecurityFiling: 20, harborMaintenanceFee: 4.73, destinationCharges: 150 };
const L1 = { codSecLineFilm: 1, tipoPelicula: 'A', precio: 2, kilosTotal: 100, valueFOB: 200 };
const L2 = { codSecLineFilm: 2, tipoPelicula: 'B', precio: 3, kilosTotal: 200, valueFOB: 600 };
const usaCtx = (line: typeof L1, header: LiquidacionLineContext['header'] = USA_HEADER): LiquidacionLineContext => ({
  pais: 'USA',
  esUSA: true,
  header,
  line,
  totalFOB: 800,
  totalKilos: 300,
});

describe('Calculadores de Liquidación', () => {
  describe('selección por entorno (LiquidacionModule)', () => {
    it(`${LIQUIDACION_SIMULATION_ENV}=true → fórmula SIMULADA`, () => {
      const c = calculatorFromEnv({ [LIQUIDACION_SIMULATION_ENV]: 'true' });
      expect(c).toBeInstanceOf(SimulatedIncotermCalculator);
      expect(c.simulated).toBe(true);
    });

    it.each([undefined, '', 'false', '1', 'TRUE'])('%j (producción) → PendingFormulaCalculator, nada simulado', (value) => {
      const c = calculatorFromEnv(value === undefined ? {} : { [LIQUIDACION_SIMULATION_ENV]: value });
      expect(c).toBeInstanceOf(PendingFormulaCalculator);
      expect(c.simulated).toBe(false);
    });
  });

  it('PendingFormulaCalculator no calcula nada (flete/seguro/otros quedan como faltantes)', () => {
    expect(new PendingFormulaCalculator().compute()).toEqual({});
  });

  describe('SimulatedIncotermCalculator (fórmula de EJEMPLO, no la de José)', () => {
    const calc = new SimulatedIncotermCalculator();

    it('destino no-USA (PF 11357 real): flete por kg, seguro sobre FOB+flete, gastos de origen sobre FOB', () => {
      const v = calc.compute({
        pais: 'COLOMBIA',
        esUSA: false,
        header: {},
        line: { codSecLineFilm: 13, tipoPelicula: 'SC---0015TN', precio: 2.85, kilosTotal: 5661.2, valueFOB: 16134.42 },
        totalFOB: 16134.42,
        totalKilos: 5661.2,
      });

      expect(v).toEqual({
        kilosTotalUnit: 1,
        valueFreight: 679.34, // 5661.2 kg × 0.12
        valueFreightUnit: 0.12,
        valueSure: 50.44, // 0.3% × (16134.42 + 679.34)
        valueSureUnit: 0.0089,
        subTotal: 16864.2,
        expensesOther: 161.34, // 1% × FOB
        expensesOtherUnit: 0.0285,
        valueTotal: 17025.54,
        total: 17025.54,
        totalUnidad: 3.0074,
      });
    });

    it('destino USA: Inland Freight se prorratea por kilos y los cargos de destino por FOB, sin perder ni un centavo', () => {
      const a = calc.compute(usaCtx(L1));
      const b = calc.compute(usaCtx(L2));

      expect(a.valueFreight).toBe(312); // 100 × 0.12 + 900 × 100/300
      expect(b.valueFreight).toBe(624); // 200 × 0.12 + 900 × 200/300
      expect(a.expensesOther).toBe(71.18); // 284.73 × 200/800
      expect(b.expensesOther).toBe(213.55); // 284.73 × 600/800
      expect(a.expensesOther! + b.expensesOther!).toBeCloseTo(284.73, 2);
      expect(a.total).toBe(584.72);
      expect(b.total).toBe(1441.22);
    });

    it('si falta un cargo de USA del encabezado, NO inventa "otros gastos" ni el total (quedan como faltantes)', () => {
      const v = calc.compute(usaCtx(L1, { ...USA_HEADER, destinationCharges: null }));
      expect(v.valueFreight).toBe(312);
      expect(v).not.toHaveProperty('expensesOther');
      expect(v).not.toHaveProperty('total');
      expect(v).not.toHaveProperty('totalUnidad');
    });

    it('sin kilos (o datos imposibles) no calcula nada — nunca divide por cero', () => {
      expect(calc.compute(usaCtx({ ...L1, kilosTotal: 0 }))).toEqual({});
      expect(calc.compute({ ...usaCtx(L1), totalKilos: 0 })).toEqual({});
    });

    it('todos los valores que devuelve son números finitos', () => {
      for (const v of [calc.compute(usaCtx(L1)), calc.compute(usaCtx(L2))]) {
        for (const n of Object.values(v)) expect(Number.isFinite(n)).toBe(true);
      }
    });
  });
});
