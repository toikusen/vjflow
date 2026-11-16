import { describe, expect, it } from 'vitest';
import { contrast } from '../contrast';
import { inkDistance, KEY_APART } from './key-ink';
import { FILL_MIN, FILL_TAIL, fillInk, fillShare, fillSpans } from './sung-fill';

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

  it('takes an ink that reads 4.5:1 on every ground and stands apart from the body ink', () => {
    for (const [accent, body, grounds] of [['#ffd23f', '#222222', ['#ffffff']], ['#3a3a8c', '#f5efe4', ['#101820', '#2a2a3a']], ['#222222', '#222222', ['#f5efe4']]] as [string, string, string[]][]) {
      // (an accent that is the body ink already takes the palette's next colour)
      const ink = fillInk(accent, ['#c0392b'], body, grounds);
      for (const g of grounds) expect(contrast(ink, g)).toBeGreaterThanOrEqual(4.5);
      expect(inkDistance(ink, body)).toBeGreaterThanOrEqual(KEY_APART);
    }
  });
});
