/**
 * Generador pseudoaleatorio determinista (mulberry32). Dado el mismo seed,
 * produce exactamente la misma secuencia — necesario para que el dataset
 * generado sea reproducible entre corridas (mismo seed → mismos datos).
 *
 * No usar Math.random() en ningún builder: rompe la reproducibilidad.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRandom {
  private readonly rng: () => number;

  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }

  next(): number {
    return this.rng();
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number, decimals = 2): number {
    const v = this.next() * (max - min) + min;
    const p = Math.pow(10, decimals);
    return Math.round(v * p) / p;
  }

  bool(probTrue = 0.5): boolean {
    return this.next() < probTrue;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick: array vacío');
    return arr[this.int(0, arr.length - 1)];
  }

  pickWeighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [value, weight] of items) {
      r -= weight;
      if (r <= 0) return value;
    }
    return items[items.length - 1][0];
  }

  shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /** Fecha aleatoria entre hoy-daysAgoMax y hoy-daysAgoMin (por defecto hasta hoy). */
  pastDate(daysAgoMax: number, daysAgoMin = 0): Date {
    const daysAgo = this.int(daysAgoMin, daysAgoMax);
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(this.int(7, 19), this.int(0, 59), this.int(0, 59), 0);
    return d;
  }

  /** Fecha posterior a `base` por entre minDays y maxDays. */
  afterDate(base: Date, minDays: number, maxDays: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + this.int(minDays, maxDays));
    return d;
  }
}
