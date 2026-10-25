import { describe, expect, it } from 'vitest';
import { phraseIndex, phrasesOf } from './lanes';

describe('lyric lanes', () => {
  it('colours a spaced line by its words and an unspaced one by chunks of about four characters', () => {
    expect(phrasesOf('LANDING THE WORLD')).toEqual(['LANDING', 'THE', 'WORLD']);
    expect(phrasesOf('一發世界變了樣子').length).toBe(2);
    expect(phrasesOf('一發')).toEqual(['一發']);
  });

  it('gives every character of the line the phrase it belongs to, spaces going with the phrase before', () => {
    expect(phraseIndex('ab cd', ['ab', 'cd'])).toEqual([0, 0, 0, 1, 1]);
  });
});

