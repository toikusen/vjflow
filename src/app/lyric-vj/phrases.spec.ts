import { describe, expect, it } from 'vitest';
import { phraseBoundaries, phrases } from './phrases';

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
});
