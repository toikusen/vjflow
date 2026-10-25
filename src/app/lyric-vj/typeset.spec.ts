import { describe, expect, it } from 'vitest';
import { typeset } from './typeset';

describe('typeset', () => {
  it('shrinks lone particles, tightens kana, enlarges a leading kanji on display lines', () => {
    const t = typeset('星の夜空を見た', true);
    expect(t[0].scale).toBe(1.18); // 星
    expect(t[1].scale).toBe(0.78); // の between kanji
    expect(t[4].scale).toBe(0.78); // を
    expect(t[6].advance).toBe(0.9); // た
    expect(typeset('星の夜空を見た', false)[0].scale).toBe(1);
  });

  it('keeps hiragana words whole and gaps Latin from Japanese', () => {
    expect(typeset('ありがとう', true).every((c) => c.scale === 1)).toBe(true);
    const t = typeset('Happyな日', true);
    expect(t[0].scale).toBe(1.08);
    expect(t[5].gapBefore).toBe(0.2);
  });
});

describe('typeset script gaps', () => {
  it('adds no gap inside English words with an apostrophe', () => {
    expect(typeset("You're", false).every((t) => t.gapBefore === 0)).toBe(true);
    expect(typeset('我愛Coca', false).some((t) => t.gapBefore > 0)).toBe(true);
  });
});
