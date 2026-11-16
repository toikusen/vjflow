import { describe, expect, it } from 'vitest';
import { stripEdges, stripSlide } from './band-clip';

describe('strip assembly', () => {
  it('cuts a block into n equal strips edge to edge', () => {
    expect(stripEdges(6)).toEqual([0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1]);
  });

  it('alternates the sides, staggers top to bottom, and has every strip home exactly at k = 1', () => {
    const at = (k: number) => Array.from({ length: 6 }, (_, i) => stripSlide(i, 6, k, 1, 0.35));
    expect(at(0).map(Math.sign)).toEqual([1, -1, 1, -1, 1, -1]);
    // a later strip has further to go at the same moment
    expect(Math.abs(at(0.3)[5])).toBeGreaterThan(Math.abs(at(0.3)[0]));
    expect(at(1).every((x) => x === 0)).toBe(true);
    expect(at(1.2).every((x) => x === 0)).toBe(true);
  });

  it('is the two-half slice with two strips and no stagger', () => {
    const k = 0.3;
    const off = 1 - (1 - k) ** 3;
    expect(stripSlide(0, 2, k, -1)).toBeCloseTo(-(1 - off));
    expect(stripSlide(1, 2, k, -1)).toBeCloseTo(1 - off);
  });
});
