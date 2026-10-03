import { describe, expect, it } from 'vitest';
import { alignLyrics, cleanLyricLine, lcsPairs, snapToPhrases } from './align';

describe('lcsPairs', () => {
  it('finds the common subsequence', () => {
    expect(lcsPairs([...'光る星'], [...'ひかる星'])).toEqual([[1, 2], [2, 3]]);
  });
});

describe('alignLyrics', () => {
  const words = [
    { text: '光る', start: 10.0, end: 10.6 },
    { text: '星', start: 10.6, end: 11.0 },
    { text: '夜空に', start: 11.2, end: 12.0 },
    // the second line is misheard entirely; the third is heard
    { text: 'あああ', start: 14.0, end: 15.0 },
    { text: '僕らなりの藍を', start: 20.0, end: 22.0 },
  ];
  const cues = alignLyrics(['光る星 夜空に', '進む先 見えなくても', '僕らなりの藍を'], words, 60);

  it('times heard lines from the words and marks them aligned', () => {
    expect(cues[0]).toMatchObject({ start: 10, confidence: 'aligned', timingSource: 'whisper' });
    expect(cues[2].start).toBeCloseTo(20, 1);
    expect(cues[2].confidence).toBe('aligned');
  });

  it('places an unheard line between its neighbours', () => {
    expect(cues[1].confidence).toBe('interpolated');
    expect(cues[1].start).toBeGreaterThan(cues[0].start);
    expect(cues[1].start).toBeLessThan(cues[2].start);
    expect(cues[0].end).toBeLessThanOrEqual(cues[1].start);
  });

  it('snaps aligned starts to where the voice comes in', () => {
    const snapped = snapToPhrases(cues, [10.3, 19.9, 30]);
    expect(snapped[0].start).toBe(10.3);
    expect(snapped[2].start).toBe(19.9);
    expect(snapped[1].start).toBe(cues[1].start); // interpolated lines stay
  });
});

describe('cleanLyricLine', () => {
  it('drops fan calls and part-colour emoji', () => {
    expect(cleanLyricLine('🩷ピンク！(📣はるちゃん)')).toBe('ピンク！');
    expect(cleanLyricLine('💙いつまでも ずっと')).toBe('いつまでも ずっと');
    expect(cleanLyricLine('(📣みるく)')).toBe('');
  });
});
