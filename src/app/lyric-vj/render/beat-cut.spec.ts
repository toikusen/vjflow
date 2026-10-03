import { describe, expect, it } from 'vitest';
import { cutPieces } from './beat-cut';

describe('cutPieces', () => {
  it('cuts a line into sung pieces of two or more characters, with their positions', () => {
    const p = cutPieces('今が一番若いの 第六感、六感またがって');
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p.length).toBeLessThanOrEqual(6);
    expect(p.every((x) => [...x.text].length >= 2)).toBe(true);
    expect(p[0].from).toBe(0);
    expect(p.map((x) => x.text).join('').replace(/\s/g, '')).toBe('今が一番若いの第六感、六感またがって');
  });
});
