import type { LiquidacionLineValues, LiquidacionTotalesInput } from './liquidacion.types';
import { conceptosDe, esFactorPoliza, esMonto } from './incoterm-rules';

export const LIQUIDACION_VALUE_CALCULATOR = Symbol('LIQUIDACION_VALUE_CALCULATOR');

/** `LIQUIDACION_SIMULATION_MODE=true` → datos del envío de EJEMPLO (solo dev/demo). Ausente en producción. */
export const LIQUIDACION_SIMULATION_ENV = 'LIQUIDACION_SIMULATION_MODE';

export interface LiquidacionEnvio {
  /** Suma de precio × kilos de todas las líneas de la PF. */
  totalValor: number;
  totalKilos: number;
  /** Kilos de cada línea de la PF, en orden — base del prorrateo. */
  kilosPorLinea: readonly number[];
}

export interface LiquidacionLineContext extends LiquidacionEnvio {
  /** Posición de `line` en `kilosPorLinea`. */
  indice: number;
  pais: string | null;
  esUSA: boolean;
  /** Normalizado ("CFR"), o null. */
  incoterm: string | null;
  totales: LiquidacionTotalesInput;
  /** `valueTotal` = precio negociado × kilos (el "valor total inicial" de José). */
  line: { codSecLineFilm: number; tipoPelicula: string; precio: number; kilosTotal: number; valueTotal: number };
}

/**
 * Punto de extensión de la fórmula de valores de la Liquidación. Lo que no
 * se puede calcular se omite y LiquidacionService lo lista como faltante.
 */
export interface LiquidacionValueCalculator {
  /**
   * true = los datos del envío NO son reales. LiquidacionService lo propaga a
   * `LiquidacionDraft.simulated` y rechaza cualquier envío real
   * (`confirm:true`) de un borrador simulado.
   */
  readonly simulated: boolean;
  /** Partes de la fórmula aún sin confirmar por José — mismo candado que `simulated`. */
  readonly sinConfirmar?: readonly string[];
  /** Completa los datos del envío antes de calcular. El real no agrega nada; el simulado rellena ejemplos. */
  resolverTotales?(totales: LiquidacionTotalesInput, envio: LiquidacionEnvio): LiquidacionTotalesInput;
  compute(ctx: LiquidacionLineContext): LiquidacionLineValues;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** José: los valores unitarios van con 4 decimales, truncados hacia abajo. `toFixed` absorbe el ruido de coma flotante (0.29 × 10⁴ = 2899.9999…). */
const trunc4 = (n: number) => Math.floor(Number((n * 10_000).toFixed(6))) / 10_000;

/**
 * Reparte `total` proporcional a `pesos`, a centavos, sin que sobre ni falte
 * uno (método del mayor residuo): la suma de las líneas cuadra exacto con lo
 * digitado. Redondear cada línea por separado no lo garantiza (87.65 entre
 * 700/300 kg → 61.36 + 26.30 = 87.66).
 */
export function prorratear(total: number, pesos: readonly number[]): number[] {
  const centavos = Math.round(total * 100);
  const suma = pesos.reduce((a, b) => a + b, 0);
  const exactos = pesos.map((p) => (centavos * p) / suma);
  const base = exactos.map((e) => Math.floor(e + 1e-9));
  let resto = centavos - base.reduce((a, b) => a + b, 0);
  const porResiduo = exactos.map((e, i) => ({ i, r: e - base[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of porResiduo) {
    if (resto <= 0) break;
    base[i] += 1;
    resto -= 1;
  }
  return base.map((c) => c / 100);
}

/**
 * Lo que es lectura nuestra de la llamada del 2026-09-30 y José no ha
 * confirmado por escrito. Mientras la lista no esté vacía, ninguna
 * liquidación calculada con esta fórmula se envía a Oben (Oben no permite
 * borrar lo creado). Cuando José confirme, se quitan de aquí.
 */
export const FORMULA_SIN_CONFIRMAR = [
  'ValueFOB y Total = FOB final (valor total − flete − seguro − otros gastos) y TotalUnidad = FOB final ÷ kilos: José no ha confirmado a qué campo de Oben va cada valor.',
  'KilosTotalUnit = precio negociado por kg: supuesto nuestro.',
  'Montos por línea a 2 decimales (flete y otros gastos repartidos sin perder centavos; seguro redondeado): José solo definió los valores unitarios (4 decimales, truncados).',
] as const;

/**
 * Fórmula de Liquidación de José Guzmán (llamada del 2026-09-30), por línea:
 *  - Valor total inicial = precio negociado × kilos.
 *  - Flete y otros gastos se digitan UNA vez por envío y se prorratean por
 *    kilos (700 kg de 1.000 → 70%).
 *  - Subtotal = valor total − flete de la línea.
 *  - Seguro: FOB inicial = Subtotal ÷ Valor de la póliza; seguro = Subtotal − FOB inicial.
 *  - FOB final = valor total − seguro − flete − otros gastos.
 *  - Cada unitario = valor de la línea ÷ kilos de la línea, 4 decimales truncados.
 * Qué conceptos aplican depende del Incoterm (ver incoterm-rules.ts); el que
 * no aplica vale 0.
 */
export class IncotermFormulaCalculator implements LiquidacionValueCalculator {
  readonly simulated: boolean = false;
  readonly sinConfirmar: readonly string[] = FORMULA_SIN_CONFIRMAR;

  compute({ incoterm, totales, line, totalKilos, kilosPorLinea, indice }: LiquidacionLineContext): LiquidacionLineValues {
    const conceptos = conceptosDe(incoterm);
    const { kilosTotal: kilos, valueTotal } = line;
    if (!conceptos || !(kilos > 0) || !(totalKilos > 0)) return {};

    const prorrateo = (total: unknown) => (esMonto(total) ? prorratear(total, kilosPorLinea)[indice] : undefined);
    const flete = conceptos.includes('flete') ? prorrateo(totales.flete) : 0;
    const otros = conceptos.includes('otrosGastos') ? prorrateo(totales.otrosGastos) : 0;
    const subTotal = flete === undefined ? undefined : round2(valueTotal - flete);
    let seguro: number | undefined = 0;
    if (conceptos.includes('seguro')) {
      const poliza = totales.valorPoliza;
      seguro = subTotal !== undefined && esFactorPoliza(poliza) ? round2(subTotal - subTotal / poliza) : undefined;
    }

    const values: LiquidacionLineValues = { valueTotal, kilosTotalUnit: line.precio };
    if (flete !== undefined && subTotal !== undefined) {
      Object.assign(values, { valueFreight: flete, valueFreightUnit: trunc4(flete / kilos), subTotal });
    }
    if (seguro !== undefined) Object.assign(values, { valueSure: seguro, valueSureUnit: trunc4(seguro / kilos) });
    if (otros !== undefined) Object.assign(values, { expensesOther: otros, expensesOtherUnit: trunc4(otros / kilos) });
    if (flete !== undefined && seguro !== undefined && otros !== undefined) {
      const fobFinal = round2(valueTotal - seguro - flete - otros);
      Object.assign(values, { valueFOB: fobFinal, total: fobFinal, totalUnidad: trunc4(fobFinal / kilos) });
    }
    return values;
  }
}

/**
 * Datos del envío de EJEMPLO para la simulación. NO son de Oben ni de ningún
 * forwarder: solo existen para poder probar el flujo completo de Liquidación
 * → Facturación en dev/demo sin que alguien digite flete/póliza.
 */
export const SIMULATED_INCOTERM_RATES = {
  /** Incoterm de ejemplo: DAP ejercita los 3 conceptos. */
  incoterm: 'DAP',
  /** Flete del envío de ejemplo, USD por kg. */
  fletePorKgUSD: 0.12,
  /** Otros gastos del envío de ejemplo, sobre el valor total. */
  otrosGastosPct: 0.01,
  /** Valor de la póliza de ejemplo (≈ 0.35% de seguro). */
  valorPoliza: 1.0035,
} as const;

/**
 * La MISMA fórmula de José, con los datos del envío que el usuario no digitó
 * rellenados con valores de ejemplo. Lo digitado se respeta.
 *
 * Candado: `simulated = true` → LiquidacionService nunca deja que un borrador
 * armado así llegue a un `submit({confirm:true})` real.
 */
export class SimulatedIncotermCalculator extends IncotermFormulaCalculator {
  override readonly simulated = true;

  resolverTotales(totales: LiquidacionTotalesInput, { totalKilos, totalValor }: LiquidacionEnvio): LiquidacionTotalesInput {
    const r = SIMULATED_INCOTERM_RATES;
    return {
      ...totales,
      incoterm: totales.incoterm ?? r.incoterm,
      flete: totales.flete ?? round2(totalKilos * r.fletePorKgUSD),
      otrosGastos: totales.otrosGastos ?? round2(totalValor * r.otrosGastosPct),
      valorPoliza: totales.valorPoliza ?? r.valorPoliza,
    };
  }
}

/** Qué calculador inyectar según el entorno — ver LiquidacionModule. */
export function calculatorFromEnv(env: NodeJS.ProcessEnv = process.env): LiquidacionValueCalculator {
  return env[LIQUIDACION_SIMULATION_ENV] === 'true' ? new SimulatedIncotermCalculator() : new IncotermFormulaCalculator();
}
