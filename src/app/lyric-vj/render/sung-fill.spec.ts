import { describe, expect, it } from 'vitest';
import { FILL_MIN, FILL_TAIL, fillAxis, fillEdge, fillShare, fillSpans } from './sung-fill';

describe('sung fill', () => {
  it('runs each character from its own sung time to the next one, the last to the line end or a held tail', () => {
    expect(fillSpans([1, 1.4, 2], 2.5)).toEqual([[1, 1.4], [1.4, 2], [2, 2.5]]);
    expect(fillSpans([1, 1.4, 2], 9)[2]).toEqual([2, 2 + FILL_TAIL]);
  });

  it('never steps back on aligner noise, and never blinks a character on in no time', () => {
    const s = fillSpans([1, 0.9, 1.2, 1.2], 2);
    expect(s.map((x) => x[0])).toEqual([1, 1, 1.2, 1.2]);
    expect(s.every(([a, b]) => b - a >= FILL_MIN - 1e-12)).toBe(true);
  });

  it('fills evenly through a span', () => {
    expect(fillShare(0.9, [1, 2])).toBe(0);
    expect(fillShare(1.25, [1, 2])).toBeCloseTo(0.25);
    expect(fillShare(2, [1, 2])).toBe(1);
  });

  it('carries the screen run into a glyph\'s own frame: advance across its own x, em across its own y', () => {
    expect(fillAxis({ x: 2, y: 0 }, 30, 40)).toEqual({ dir: [1, 0], extent: 30 });
    expect(fillAxis({ x: 0, y: -1 }, 30, 40)).toEqual({ dir: [0, -1], extent: 40 });
    // a Latin glyph turned −90° in a column: down the screen is its own +x, along its advance
    const turned = fillAxis({ x: 1, y: 1e-16 }, 30, 40);
    expect(turned.dir[0]).toBeCloseTo(1);
    expect(turned.extent).toBeCloseTo(30);
  });

  it('places the edge from the glyph centre: nothing before, all after', () => {
    expect(fillEdge(0, 30)).toBeLessThan(-1000);
    expect(fillEdge(0.25, 30)).toBeCloseTo(-7.5);
    expect(fillEdge(1, 30)).toBeGreaterThan(1000);
  });
});
