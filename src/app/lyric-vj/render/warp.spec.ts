import { offsetAt, wind, zoneOffset } from './warp';

describe('warp', () => {
  const ts = [0, 0.7, 3.1, 9.4];

  it('keeps the pinned edge of a swaying zone still and moves its tip', () => {
    for (const t of ts) expect(zoneOffset({ kind: 'sway' }, 0.5, 1, t, 400, 400)).toEqual([0, -0]);
    expect(Math.max(...ts.map((t) => Math.abs(zoneOffset({ kind: 'sway' }, 0.5, 0, t, 400, 400)[0])))).toBeGreaterThan(2);
  });

  it('leaves everything outside the zones rigid', () => {
    const sail = { kind: 'billow' as const, rect: [0.3, 0.1, 0.7, 0.6] as [number, number, number, number] };
    for (const t of ts) expect(offsetAt([sail], 0.5, 0.9, t, 600, 600)).toEqual([0, 0]);
    expect(offsetAt([sail], 0.5, 0.35, 1, 600, 600)[0]).toBeGreaterThan(0);
  });

  it('swings about the top centre of its zone', () => {
    for (const t of ts) {
      const [dx, dy] = zoneOffset({ kind: 'swing' }, 0.5, 0, t, 300, 500);
      expect(Math.abs(dx) + Math.abs(dy)).toBeLessThan(1e-9);
    }
  });

  it('blows a bounded, smooth wind', () => {
    for (let t = 0; t < 60; t += 0.05) {
      expect(Math.abs(wind(t))).toBeLessThanOrEqual(1);
      expect(Math.abs(wind(t + 1 / 60) - wind(t))).toBeLessThan(0.15);
    }
  });
});

import { coverOf } from './graphics';

describe('lyric cover', () => {
  // a picture with no readable pixels counts as fully opaque (the safe side)
  const pic = { width: 100, height: 100 } as unknown as CanvasImageSource & { width: number; height: number };
  const id = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix;
  const box = { x0: 100, y0: 100, x1: 300, y1: 200 };

  it('measures the share of the lyric box a sprite hides', () => {
    expect(coverOf(pic, id, 100, 100, 100, 100, box)[0]).toBeCloseTo(0.5, 2);
    expect(coverOf(pic, id, 100, 100, 100, 100, box)[1]).toBeCloseTo(1, 2);
    expect(coverOf(pic, id, 0, 0, 50, 50, box)[0]).toBe(0);
  });

  it('follows the transform the sprite was drawn with', () => {
    const moved = { ...id, e: 100, f: 100 } as DOMMatrix;
    expect(coverOf(pic, moved, 0, 0, 200, 100, box)[0]).toBeCloseTo(1, 2);
  });
});
