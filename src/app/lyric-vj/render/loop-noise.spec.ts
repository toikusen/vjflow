import { describe, expect, it } from 'vitest';
import { loopNoise } from './loop-noise';

describe('loopNoise', () => {
  const at = (period: number, seed: number, n = 600) => Array.from({ length: n }, (_, i) => loopNoise((i / n) * period * 3 - period, period, seed));

  it('loops seamlessly: the same value a period later, before and after zero', () => {
    for (const t of [0, 0.37, 5.2, 11.9, -3.1]) expect(loopNoise(t + 12, 12, 4)).toBeCloseTo(loopNoise(t, 12, 4), 9);
  });

  it('stays in -1..1, uses most of it, and moves smoothly (no step between nearby frames)', () => {
    const v = at(12, 9);
    expect(Math.max(...v.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(Math.max(...v) - Math.min(...v)).toBeGreaterThan(0.6);
    // 60 frames a second: no frame-to-frame jump larger than a small share of the range
    const step = Math.max(...Array.from({ length: 720 }, (_, i) => Math.abs(loopNoise((i + 1) / 60, 12, 9) - loopNoise(i / 60, 12, 9))));
    expect(step).toBeLessThan(0.08);
  });

  it('is its own path per seed, and the same path for the same seed', () => {
    expect(at(12, 1)).toEqual(at(12, 1));
    const [a, b] = [at(12, 1), at(12, 2)];
    expect(a.filter((x, i) => Math.abs(x - b[i]) > 0.1).length).toBeGreaterThan(a.length / 4);
  });

  it('does not pass through zero on a steady beat (octave lattices are offset)', () => {
    const hits = [0, 1, 2, 3].map((k) => Math.abs(loopNoise((k * 12) / 4, 12, 5)));
    expect(hits.some((h) => h > 0.02)).toBe(true);
  });
});
