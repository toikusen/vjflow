import { describe, expect, it } from 'vitest';
import { atLength, rectEdge } from './layouts';

describe('ribbon curve', () => {
  it('finds the x at an arc length on a sampled curve', () => {
    // a straight line at 45°: length √2 per unit of x
    const xs = [0, 1, 2, 3];
    const ls = xs.map((x) => x * Math.SQRT2);
    expect(atLength(xs, ls, 1.5 * Math.SQRT2)).toBeCloseTo(1.5);
    expect(atLength(xs, ls, 0)).toBeCloseTo(0);
  });
});

describe('tunnel walls', () => {
  it('walks the rectangle clockwise from the top-left, text facing the centre', () => {
    expect(rectEdge(0, 100, 50)).toEqual([-100, 50, 0]);
    expect(rectEdge(250, 100, 50)).toEqual([100, 0, -Math.PI / 2]);
    expect(rectEdge(400, 100, 50)).toEqual([0, -50, Math.PI]);
    expect(rectEdge(550, 100, 50)).toEqual([-100, 0, Math.PI / 2]);
    // wraps around
    expect(rectEdge(600, 100, 50)).toEqual([-100, 50, 0]);
  });
});
