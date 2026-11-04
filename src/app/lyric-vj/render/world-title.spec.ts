import { describe, expect, it } from 'vitest';
import { TITLE_OPENING_SEC, titleNow } from './world-title';

describe('the song title on a world page', () => {
  it('shows on a cut that opens in the song opening only', () => {
    expect(titleNow({ title: 'A - B', now: 6, age: 2 })).toBe('A - B');
    expect(titleNow({ title: 'A - B', now: TITLE_OPENING_SEC + 30, age: 31 })).toBe('A - B');
    expect(titleNow({ title: 'A - B', now: 80, age: 1 })).toBe('');
  });
  it('is empty when the song has none', () => {
    expect(titleNow({ now: 3, age: 1 })).toBe('');
  });
});
