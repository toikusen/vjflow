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

  it('splits long phrases so no big piece is longer than 6 characters', () => {
    const p = cutPieces('今日は年甲斐ないことしたいの');
    expect(p.every((x) => [...x.text].length <= 6)).toBe(true);
    expect(p.map((x) => x.text).join('')).toBe('今日は年甲斐ないことしたいの');
  });

  it('never cuts inside a kanji run', () => {
    const p = cutPieces('今が一番若いの 第六感、六感またがって');
    expect(p.map((x) => x.text.trim())).toContain('またがって');
    const kanji = /\p{Script=Han}/u;
    const joined = p.map((x) => x.text);
    for (let i = 1; i < joined.length; i++) expect(kanji.test(joined[i - 1].trim().slice(-1)) && kanji.test(joined[i].trim()[0])).toBe(false);
  });
});
