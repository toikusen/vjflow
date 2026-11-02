import { describe, expect, it } from 'vitest';
import { emboldenFor } from './glyphs';

describe('emboldenFor', () => {
  it('holds the stroke under 4 % of the size, and under 2 % for a Han character', () => {
    expect(emboldenFor('あ', { size: 100, embolden: 3.5 })).toBe(3.5);
    expect(emboldenFor('あ', { size: 100, embolden: 9 })).toBe(4);
    expect(emboldenFor('歌', { size: 100, embolden: 3.5 })).toBe(2);
    expect(emboldenFor('A', { size: 100, embolden: 3.5 })).toBe(3.5);
    expect(emboldenFor('歌', { size: 100 })).toBe(0);
  });
});
