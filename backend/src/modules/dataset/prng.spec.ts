import { SeededRandom, mulberry32 } from './prng';

describe('mulberry32', () => {
  it('mismo seed produce la misma secuencia', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('seeds distintos producen secuencias distintas', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('produce valores en [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('SeededRandom', () => {
  it('int() respeta límites inclusive', () => {
    const rng = new SeededRandom(1);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it('pick() siempre devuelve un elemento del array', () => {
    const rng = new SeededRandom(2);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('pickWeighted() favorece elementos con más peso (estadísticamente)', () => {
    const rng = new SeededRandom(3);
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) {
      const v = rng.pickWeighted([['a', 95] as const, ['b', 5] as const]);
      counts[v]++;
    }
    expect(counts.a).toBeGreaterThan(counts.b * 5);
  });

  it('bool(1) siempre true, bool(0) siempre false', () => {
    const rng = new SeededRandom(4);
    for (let i = 0; i < 20; i++) {
      expect(rng.bool(1)).toBe(true);
      expect(rng.bool(0)).toBe(false);
    }
  });

  it('shuffle() es una permutación (mismos elementos, mismo tamaño)', () => {
    const rng = new SeededRandom(5);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle(arr);
    expect(shuffled).toHaveLength(arr.length);
    expect([...shuffled].sort()).toEqual([...arr].sort());
  });

  it('misma instancia con mismo seed reproduce la misma secuencia de llamadas mixtas', () => {
    const r1 = new SeededRandom(99);
    const r2 = new SeededRandom(99);
    const seq1 = [
      r1.int(0, 100),
      r1.float(0, 1),
      r1.bool(),
      r1.pick([1, 2, 3]),
    ];
    const seq2 = [
      r2.int(0, 100),
      r2.float(0, 1),
      r2.bool(),
      r2.pick([1, 2, 3]),
    ];
    expect(seq1).toEqual(seq2);
  });
});
