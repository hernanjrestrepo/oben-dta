import {
  FORMULA_SIN_CONFIRMAR,
  IncotermFormulaCalculator,
  LIQUIDACION_SIMULATION_ENV,
  LIQUIDACION_VALOR_POLIZA_ENV,
  SIMULATED_INCOTERM_RATES,
  VALOR_POLIZA_VIGENTE,
  SimulatedIncotermCalculator,
  calculatorFromEnv,
  prorratear,
  type LiquidacionLineContext,
} from './liquidacion-value-calculator';
import type { LiquidacionTotalesInput } from './liquidacion.types';

// PF de 2 líneas, 700 + 300 kg (el ejemplo de José: 70% / 30% del flete).
const L1 = { codSecLineFilm: 1, tipoPelicula: 'A', precio: 2.55, kilosTotal: 700, valueTotal: 1785 };
const L2 = { codSecLineFilm: 2, tipoPelicula: 'B', precio: 2.827, kilosTotal: 300, valueTotal: 848.1 };
const TOTALES: LiquidacionTotalesInput = { flete: 1234.56, otrosGastos: 87.65, valorPoliza: 1.0035 };

const ctx = (indice: 0 | 1, incoterm: string | null, totales: LiquidacionTotalesInput = TOTALES): LiquidacionLineContext => ({
  pais: 'PERU',
  esUSA: false,
  incoterm,
  totales,
  line: [L1, L2][indice],
  indice,
  kilosPorLinea: [700, 300],
  totalValor: 2633.1,
  totalKilos: 1000,
});

describe('Calculadores de Liquidación', () => {
  describe('selección por entorno (LiquidacionModule)', () => {
    it(`${LIQUIDACION_SIMULATION_ENV}=true → datos del envío SIMULADOS`, () => {
      const c = calculatorFromEnv({ [LIQUIDACION_SIMULATION_ENV]: 'true' });
      expect(c).toBeInstanceOf(SimulatedIncotermCalculator);
      expect(c.simulated).toBe(true);
    });

    it.each([undefined, '', 'false', '1', 'TRUE'])('%j (producción) → fórmula de José, nada simulado', (value) => {
      const c = calculatorFromEnv(value === undefined ? {} : { [LIQUIDACION_SIMULATION_ENV]: value });
      expect(c).toBeInstanceOf(IncotermFormulaCalculator);
      expect(c).not.toBeInstanceOf(SimulatedIncotermCalculator);
      expect(c.simulated).toBe(false);
    });

    it('mientras quede algo sin validar con Oben, la fórmula lo declara (y eso bloquea el envío real)', () => {
      expect(new IncotermFormulaCalculator().sinConfirmar).toEqual(FORMULA_SIN_CONFIRMAR);
      expect(FORMULA_SIN_CONFIRMAR.length).toBeGreaterThan(0);
    });

    it(`Valor de la póliza vigente ${VALOR_POLIZA_VIGENTE} (José) por defecto; ${LIQUIDACION_VALOR_POLIZA_ENV} lo cambia sin tocar código`, () => {
      expect((calculatorFromEnv({}) as IncotermFormulaCalculator).valorPolizaVigente).toBe(1.00053);
      expect((calculatorFromEnv({ [LIQUIDACION_VALOR_POLIZA_ENV]: '1.0007' }) as IncotermFormulaCalculator).valorPolizaVigente).toBe(1.0007);
      for (const invalido of ['abc', '0.0005', '1', '']) {
        expect((calculatorFromEnv({ [LIQUIDACION_VALOR_POLIZA_ENV]: invalido }) as IncotermFormulaCalculator).valorPolizaVigente).toBe(1.00053);
      }
    });
  });

  describe('prorratear (por kilos, a centavos)', () => {
    it('el ejemplo de José: 1.000 USD entre 700 y 300 kg → 70% / 30%', () => {
      expect(prorratear(1000, [700, 300])).toEqual([700, 300]);
    });

    it('la suma cuadra EXACTO con lo digitado (redondear línea por línea daría 87.66)', () => {
      const partes = prorratear(87.65, [700, 300]);
      expect(partes).toEqual([61.36, 26.29]); // empate en el residuo (0.5 / 0.5): el centavo va a la primera
      expect(Math.round(partes.reduce((a, b) => a + b, 0) * 100)).toBe(8765);
    });

    it('tres partes iguales: el centavo sobrante va a la primera, determinista', () => {
      expect(prorratear(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
    });

    it('una línea de 0 kg no recibe nada', () => {
      expect(prorratear(50, [0, 10])).toEqual([0, 50]);
    });
  });

  describe('IncotermFormulaCalculator — fórmula de José (llamada 2026-09-30)', () => {
    const calc = new IncotermFormulaCalculator();

    it('la póliza es global: si no se digita, se usa la vigente; la digitada manda', () => {
      const envio = { totalKilos: 1000, totalValor: 2633.1, kilosPorLinea: [700, 300] };
      expect(calc.resolverTotales({ incoterm: 'DAP' }, envio)).toEqual({ incoterm: 'DAP', valorPoliza: 1.00053 });
      expect(calc.resolverTotales({ valorPoliza: 1.001 }, envio).valorPoliza).toBe(1.001);
    });

    it('DAP/DDP: flete + seguro + otros gastos; FOB final = valor total − los tres', () => {
      for (const incoterm of ['DAP', 'DDP']) {
        expect(calc.compute(ctx(0, incoterm))).toEqual({
          valueTotal: 1785, // 2.55 × 700
          // Precio final (José): 2.55 − 1.2345 − 0.0045 − 0.0876
          kilosTotalUnit: 1.2234,
          valueFreight: 864.19, // 1234.56 × 70%
          valueFreightUnit: 1.2345, // 864.19 / 700 = 1.23455… truncado
          subTotal: 920.81, // 1785 − 864.19
          valueSure: 3.21, // 920.81 − 920.81 / 1.0035
          valueSureUnit: 0.0045,
          expensesOther: 61.36, // 87.65 × 70% = 61.355, reparto sin perder centavos
          expensesOtherUnit: 0.0876,
          valueFOB: 856.24, // 1785 − 3.21 − 864.19 − 61.36
          // José (2026-09-30): Total y TotalUnidad se mandan en 0.
          total: 0,
          totalUnidad: 0,
        });
      }
    });

    it('CFR/CPT: SOLO flete (José, WhatsApp 2026-09-30) — seguro y otros gastos en 0 aunque se digiten', () => {
      for (const incoterm of ['CFR', 'CPT']) {
        const v = calc.compute(ctx(1, incoterm));
        expect(v).toMatchObject({
          valueFreight: 370.37, // 1234.56 × 30%
          subTotal: 477.73, // 848.10 − 370.37
          valueSure: 0,
          valueSureUnit: 0,
          expensesOther: 0,
          expensesOtherUnit: 0,
          valueFOB: 477.73,
          kilosTotalUnit: 1.5925, // 2.827 − 1.2345
          total: 0,
          totalUnidad: 0,
        });
      }
    });

    it('CFR no necesita la póliza ni los otros gastos para quedar completo', () => {
      const v = calc.compute(ctx(0, 'CFR', { flete: 1234.56 }));
      expect(v.valueFOB).toBe(920.81);
    });

    it('FCA/FOB: no se pide nada — la mercancía queda igual (FOB = valor total)', () => {
      for (const incoterm of ['FCA', 'FOB']) {
        expect(calc.compute(ctx(0, incoterm, {}))).toMatchObject({
          valueFreight: 0,
          valueSure: 0,
          expensesOther: 0,
          subTotal: 1785,
          valueFOB: 1785,
          kilosTotalUnit: 2.55, // sin deducciones, el precio final es el negociado
          totalUnidad: 0,
        });
      }
    });

    it('sin el flete digitado no calcula flete, subtotal, seguro ni FOB (quedan como faltantes)', () => {
      const v = calc.compute(ctx(0, 'DAP', { otrosGastos: 87.65, valorPoliza: 1.0035 }));
      expect(v).toMatchObject({ valueTotal: 1785, expensesOther: 61.36 });
      for (const k of ['valueFreight', 'subTotal', 'valueSure', 'valueFOB', 'kilosTotalUnit']) {
        expect(v).not.toHaveProperty(k);
      }
    });

    it.each([[undefined], [1], [0.0035], [-2]])('DAP con Valor de la póliza %j: el seguro NO se calcula (no se inventa)', (valorPoliza) => {
      const v = calc.compute(ctx(0, 'DAP', { ...TOTALES, valorPoliza }));
      expect(v.valueFreight).toBe(864.19);
      expect(v).not.toHaveProperty('valueSure');
      expect(v).not.toHaveProperty('valueFOB');
    });

    it('un flete negativo o que no es número no cuenta como digitado', () => {
      expect(calc.compute(ctx(0, 'CFR', { flete: -5 }))).not.toHaveProperty('valueFreight');
      expect(calc.compute(ctx(0, 'CFR', { flete: '100' as unknown as number }))).not.toHaveProperty('valueFreight');
    });

    it.each([[null], ['XYZ']])('Incoterm %j (ausente o no es Incoterm 2020) → no calcula nada', (incoterm) => {
      expect(calc.compute(ctx(0, incoterm))).toEqual({});
    });

    it('CIF lleva flete y seguro, sin otros gastos', () => {
      const v = calc.compute(ctx(0, 'CIF', { flete: 300, valorPoliza: 1.00053 }));
      expect(v.valueFreight).toBeGreaterThan(0);
      expect(v.valueSure).toBeGreaterThan(0);
      expect(v.expensesOther ?? 0).toBe(0);
    });

    it('EXW y FAS no llevan flete, seguro ni otros', () => {
      for (const inc of ['EXW', 'FAS']) {
        const v = calc.compute(ctx(0, inc, { flete: 300, otrosGastos: 50 }));
        expect(v.valueFreight ?? 0).toBe(0);
        expect(v.valueSure ?? 0).toBe(0);
        expect(v.expensesOther ?? 0).toBe(0);
      }
    });

    it('unitarios con 4 decimales TRUNCADOS, sin ruido de coma flotante', () => {
      const una = (kilos: number, flete: number) =>
        calc.compute({ ...ctx(0, 'CFR', { flete }), line: { ...L1, kilosTotal: kilos, valueTotal: 2.55 * kilos }, kilosPorLinea: [kilos], indice: 0, totalKilos: kilos });
      expect(una(100, 29).valueFreightUnit).toBe(0.29); // 0.29 × 10⁴ = 2899.9999… en binario
      expect(una(3, 2).valueFreightUnit).toBe(0.6666); // 0.66666…: truncado, no 0.6667
    });

    it('sin kilos no calcula nada — nunca divide por cero', () => {
      expect(calc.compute({ ...ctx(0, 'DAP'), totalKilos: 0 })).toEqual({});
      expect(calc.compute({ ...ctx(0, 'DAP'), line: { ...L1, kilosTotal: 0 } })).toEqual({});
    });
  });

  describe('SimulatedIncotermCalculator — misma fórmula, datos del envío de EJEMPLO', () => {
    const calc = new SimulatedIncotermCalculator();
    const envio = { totalKilos: 5661.2, totalValor: 16134.42, kilosPorLinea: [5661.2] };

    it('rellena lo que el usuario no digitó con los valores de ejemplo', () => {
      expect(calc.resolverTotales({}, envio)).toEqual({
        incoterm: SIMULATED_INCOTERM_RATES.incoterm,
        flete: 679.34, // 5661.2 kg × 0.12
        otrosGastos: 161.34, // 1% × 16134.42
        valorPoliza: VALOR_POLIZA_VIGENTE, // la póliza es un dato real (José), no de ejemplo
      });
    });

    it('lo digitado se respeta (incluido un 0 explícito)', () => {
      expect(calc.resolverTotales({ incoterm: 'CFR', flete: 0 }, envio)).toMatchObject({ incoterm: 'CFR', flete: 0 });
    });

    it('PF 11357 real (2.85 USD × 5661.2 kg) con los datos de ejemplo', () => {
      const totales = calc.resolverTotales({}, envio);
      const v = calc.compute({
        ...envio,
        indice: 0,
        pais: 'COLOMBIA',
        esUSA: false,
        incoterm: 'DAP',
        totales,
        line: { codSecLineFilm: 13, tipoPelicula: 'SC---0015TN', precio: 2.85, kilosTotal: 5661.2, valueTotal: 16134.42 },
      });
      // seguro = 15455.08 − 15455.08 / 1.00053
      expect(v).toMatchObject({ valueFreight: 679.34, subTotal: 15455.08, valueSure: 8.19, expensesOther: 161.34, valueFOB: 15285.55 });
    });
  });
});
