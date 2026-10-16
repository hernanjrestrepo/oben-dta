import {
  FORMULA_SIN_CONFIRMAR,
  IncotermFormulaCalculator,
  LIQUIDACION_SIMULATION_ENV,
  LIQUIDACION_VALOR_POLIZA_ENV,
  SIMULATED_INCOTERM_RATES,
  VALOR_POLIZA_VIGENTE,
  SimulatedIncotermCalculator,
  calculatorFromEnv,
  igualarConFlete,
  noQuedarPorDebajo,
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

const round2 = (n: number) => Math.round(n * 100) / 100;

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

    it('José confirmó por escrito el redondeo y el FOB (2026-10-06): ya no queda nada sin confirmar', () => {
      expect(new IncotermFormulaCalculator().sinConfirmar).toEqual(FORMULA_SIN_CONFIRMAR);
      expect(FORMULA_SIN_CONFIRMAR).toEqual([]);
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

    it('tres partes iguales: el centavo sobrante va al ÚLTIMO ítem (José, 2026-10-06)', () => {
      expect(prorratear(100, [1, 1, 1])).toEqual([33.33, 33.33, 33.34]);
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
          // Precio final (José): 2.55 − 1.2346 − 0.0046 − 0.0877
          kilosTotalUnit: 1.2231,
          valueFreight: 864.19, // 1234.56 × 70%
          valueFreightUnit: 1.2346, // 864.19 / 700 = 1.234557… redondeado
          subTotal: 920.81, // 1785 − 864.19
          valueSure: 3.21, // 920.81 − 920.81 / 1.0035
          valueSureUnit: 0.0046, // 0.004585…
          expensesOther: 61.36, // 87.65 × 70% = 61.355, reparto sin perder centavos
          expensesOtherUnit: 0.0877, // 0.087657…
          valueFOB: 856.17, // 1.2231 × 700 (la PF completa se ajusta con noQuedarPorDebajo)
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
          valueFOB: 477.72, // 1.5924 × 300
          kilosTotalUnit: 1.5924, // 2.827 − 1.2346 (370.37 / 300 = 1.234566… redondeado)
          total: 0,
          totalUnidad: 0,
        });
      }
    });

    it('PF 10867 REAL de OBEN MAS (CFR, flete 752): cuadra con la pantalla de Oben centavo por centavo', () => {
      const line = { codSecLineFilm: 6, tipoPelicula: 'SC---0020TN', precio: 2.55, kilosTotal: 22080.76, valueTotal: 56305.94 };
      const v = calc.compute({
        pais: 'BRASIL',
        esUSA: false,
        incoterm: 'CFR',
        totales: { flete: 752 },
        line,
        indice: 0,
        kilosPorLinea: [22080.76],
        totalValor: 56305.94,
        totalKilos: 22080.76,
      } as never);
      // Redondeado: 752 / 22080.76 = 0.034056… → 0.0341; FOB 55552.98 + 752 < 56305.94 → ajuste de 0.0001.
      expect(v).toMatchObject({ valueFreightUnit: 0.0341, valueFOB: 55552.98 });
      const lineas = [{ ...line, ...v }];
      expect(noQuedarPorDebajo(lineas)).toBe(1);
      expect(lineas[0]).toMatchObject({ valueTotal: 56305.94, valueFreight: 752, valueFreightUnit: 0.034, kilosTotalUnit: 2.516, valueFOB: 55555.19 });
      expect(round2((lineas[0].valueFOB as number) + 752)).toBe(56307.19); // "Total" de la factura de Oben
    });

    it('PF 11237 REAL (DAP a Cincinnati, reunión del 15-oct): flete 3150, otros 1069.34 → los valores de José al centavo', () => {
      const line = { codSecLineFilm: 1, tipoPelicula: 'SC', precio: 2.22, kilosTotal: 17887.16, valueTotal: 39709.5 };
      const v = calc.compute({
        pais: 'ESTADOS UNIDOS',
        esUSA: true,
        incoterm: 'DAP',
        totales: { flete: 3150, otrosGastos: 1069.34, valorPoliza: 1.00053 },
        line,
        indice: 0,
        kilosPorLinea: [17887.16],
        totalValor: 39709.5,
        totalKilos: 17887.16,
      } as never);
      const lineas = [{ ...line, ...v }];
      expect(noQuedarPorDebajo(lineas)).toBe(1);
      // José: flete unidad 0.1760, seguro 0.0011, otros 0.0598, precio 1.9831, FOB 35472.03 (truncando daba 0.1761 / 0.0010 / 0.0597 / 35473.82).
      expect(lineas[0]).toMatchObject({
        valueSure: 19.37,
        valueFreightUnit: 0.176,
        valueSureUnit: 0.0011,
        expensesOtherUnit: 0.0598,
        kilosTotalUnit: 1.9831,
        valueFOB: 35472.03,
      });
    });

    it('noQuedarPorDebajo: si ya no queda por debajo, no toca nada; sin FOB en alguna línea, tampoco', () => {
      const ok = [{ precio: 2, kilosTotal: 100, valueTotal: 200, valueFOB: 190, valueFreight: 10, valueFreightUnit: 0.1, kilosTotalUnit: 1.9 }];
      expect(noQuedarPorDebajo(ok)).toBe(0);
      expect(ok[0].valueFOB).toBe(190);
      expect(noQuedarPorDebajo([{ precio: 2, kilosTotal: 100, valueTotal: 200, valueFreightUnit: 0.1 }])).toBe(0);
    });

    it('igualarConFlete (16-oct): FOB + flete + seguro + otros = valor de la mercancía exacto, ajustando el flete del último ítem', () => {
      const lineas = [ctx(0, 'DAP'), ctx(1, 'DAP')].map((c) => ({ ...c.line, ...calc.compute(c) }));
      noQuedarPorDebajo(lineas);
      const fleteAntes = lineas[1].valueFreight as number;
      const ajuste = igualarConFlete(lineas);
      const suma = lineas.reduce((a, l) => a + (l.valueFOB ?? 0) + (l.valueFreight ?? 0) + (l.valueSure ?? 0) + (l.expensesOther ?? 0), 0);
      expect(round2(suma)).toBe(round2(1785 + 848.1));
      expect(lineas[1].valueFreight).toBe(round2(fleteAntes + ajuste));
      expect(lineas[1].subTotal).toBe(round2(848.1 - (lineas[1].valueFreight as number)));
      expect(igualarConFlete(lineas)).toBe(0); // ya cuadra
    });

    it('igualarConFlete: sin flete (FOB/FCA) no toca nada', () => {
      const l = [{ precio: 2, kilosTotal: 100, valueTotal: 200, valueFOB: 199.99, valueFreight: 0 }];
      expect(igualarConFlete(l)).toBe(0);
      expect(l[0].valueFreight).toBe(0);
    });

    it('noQuedarPorDebajo: ajusta SOLO el último ítem de la PF', () => {
      const lineas = [ctx(0, 'DAP'), ctx(1, 'DAP')].map((c) => ({ ...c.line, ...calc.compute(c) }));
      const antes = { ...lineas[0] };
      noQuedarPorDebajo(lineas);
      expect(lineas[0]).toEqual(antes);
      const suma = lineas.reduce((a, l) => a + (l.valueFOB ?? 0) + (l.valueFreight ?? 0) + (l.valueSure ?? 0) + (l.expensesOther ?? 0), 0);
      expect(round2(suma)).toBeGreaterThanOrEqual(1785 + 848.1);
    });

    it('CFR no necesita la póliza ni los otros gastos para quedar completo', () => {
      const v = calc.compute(ctx(0, 'CFR', { flete: 1234.56 }));
      expect(v.valueFOB).toBe(920.78); // (2.55 − 1.2346) × 700
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

    it('unitarios con 4 decimales REDONDEADOS (PF 11237, 15-oct), sin ruido de coma flotante', () => {
      const una = (kilos: number, flete: number) =>
        calc.compute({ ...ctx(0, 'CFR', { flete }), line: { ...L1, kilosTotal: kilos, valueTotal: 2.55 * kilos }, kilosPorLinea: [kilos], indice: 0, totalKilos: kilos });
      expect(una(100, 29).valueFreightUnit).toBe(0.29); // 0.29 × 10⁴ = 2899.9999… en binario
      expect(una(3, 2).valueFreightUnit).toBe(0.6667); // 0.66666…: redondeado
      expect(una(3, 1).valueFreightUnit).toBe(0.3333);
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
      expect(v).toMatchObject({ valueFreight: 679.34, subTotal: 15455.08, valueSure: 8.19, expensesOther: 161.34, valueFOB: 15285.81 });
    });
  });
});
