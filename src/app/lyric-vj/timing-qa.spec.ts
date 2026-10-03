import { describe, expect, it } from 'vitest';
import { checkLines } from './timing-qa';

// singing 10.0–12.0, 13.0–15.0, 20.0–24.0 (100 fps)
const active = Array.from({ length: 3000 }, (_, i) => {
  const t = i / 100;
  return (t >= 10 && t < 12) || (t >= 13 && t < 15) || (t >= 20 && t < 24);
});

describe('checkLines', () => {
  it('passes lines that start with the voice and last until it stops', () => {
    const r = checkLines([{ id: 'a', start: 10, end: 13 }, { id: 'b', start: 13, end: 16 }], active);
    expect(r.every((x) => x.ok)).toBe(true);
  });

  it('flags text before the voice, text after it, cut-off and silent lines, with a suggested start', () => {
    const r = checkLines(
      [
        { id: 'early', start: 9.0, end: 12.5 },
        { id: 'late', start: 13.6, end: 15.5 },
        { id: 'silent', start: 16, end: 18 },
        { id: 'cut', start: 20, end: 22 },
      ],
      active,
    );
    expect(r.map((x) => x.issues)).toEqual([['early'], ['late'], ['silent'], ['cut']]);
    expect(r[0].suggestedStart).toBe(10);
    expect(r[1].suggestedStart).toBe(13);
  });
});
