import { describe, expect, it } from 'vitest';
import { chunks, phraseBoundaries, phrases } from './phrases';

describe('phrases', () => {
  it('keeps verbs with their endings and nouns with their particles', () => {
    expect(phrases('急かすように　胸を騒ぎたて')).toEqual(['急かすように', '胸を', '騒ぎたて']);
    expect(phrases('僕らなりの藍を　描いてゆこう')).toEqual(['僕らなりの', '藍を', '描いてゆこう']);
    expect(phrases('先にきっと')).toEqual(['先に', 'きっと']);
  });

  it('rejects a cut inside 騒ぎたて', () => {
    const b = phraseBoundaries('急かすように　胸を騒ぎたて');
    expect(b.has(9)).toBe(true); // before 騒
    expect(b.has(11)).toBe(false); // between 騒ぎ and たて
  });

  it('chunks lines at spaces, then at the phrase nearest the middle', () => {
    expect(chunks('明日を隠す暗闇さえ 背負って', 3)).toEqual(['明日を隠す', '暗闇さえ', '背負って']);
    expect(chunks('上手く 輝けないなら', 2)).toEqual(['上手く', '輝けないなら']);
    expect(chunks('a b c d', 2)).toEqual(['ab', 'cd']);
    expect(chunks('先にきっと', 3)).toEqual(['先にきっと']); // too short to split
  });
});
