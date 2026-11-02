import { describe, expect, it } from 'vitest';
import { Alignment, evenSpread, mainIndexes, matchLine, settle, sungTimes, timesFrom, voicedSpread, wordIndex } from './sung-times';

const cue = { text: '(幹什麼? 幹什麼?) 已被我一腳踢開 哈!', start: 73.32, end: 76.03 };
const chars = (text: string, starts: number[], p = 0.8) => ({ text, start: starts[0], end: starts.at(-1)! + 0.3, words: [...text].map((ch, i) => ({ text: ch, start: starts[i], end: starts[i] + 0.15, p })) });
const whisper: Alignment = { model: 'large-v3-turbo', lines: [chars('已被我一腳踢開哈', [73.6, 73.96, 74.1, 74.28, 74.42, 74.58, 74.86, 75.32])] };
const mms: Alignment = { model: 'MMS_FA', lines: [{ text: cue.text, start: 72.57, end: 76.3, words: ['gan', 'shen', 'me', 'gan', 'shen', 'me', 'yi', 'bei', 'wo', 'yi', 'jiao', 'ti', 'kai', 'ha'].map((s, i) => ({ text: s, start: 72.57 + i * 0.2, end: 72.7 + i * 0.2, p: 0.6 })) }] };

describe('mainIndexes and wordIndex', () => {
  it('leaves the bracketed calls out', () => {
    const main = mainIndexes(cue.text).map((i) => [...cue.text][i]).join('');
    expect(main).toBe(' 已被我一腳踢開 哈!');
  });
  it('finds a word outside the asides only', () => {
    expect(wordIndex(cue.text, '踢')).toBe(17);
    expect(wordIndex(cue.text, '踢開')).toBe(17);
    expect(wordIndex(cue.text, '幹什麼')).toBe(-1);
    expect(wordIndex(cue.text, '')).toBe(-1);
  });
});

describe('matchLine', () => {
  it('matches by the sung words, with or without the asides, nearest in time', () => {
    expect(matchLine(cue, whisper.lines)).toBe(whisper.lines[0]);
    expect(matchLine(cue, mms.lines)).toBe(mms.lines[0]);
    expect(matchLine({ ...cue, start: 120 }, whisper.lines)).toBeUndefined();
  });
});

describe('timesFrom', () => {
  it('maps a character aligner onto the main text', () => {
    const t = timesFrom(cue, whisper.lines[0])!;
    expect(t[17]).toBeCloseTo(74.58, 2);
    expect(t[0]).toBeUndefined();
  });
  it('maps a syllable aligner by count over the whole line', () => {
    const t = timesFrom(cue, mms.lines[0])!;
    expect(t[1]).toBeCloseTo(72.57, 2);
    expect(t[17]).toBeCloseTo(72.57 + 11 * 0.2, 2);
  });
  it('refuses an alignment that drifted', () => {
    expect(timesFrom(cue, chars('已被我一腳踢開哈', [73.6, 73.96, 74.1, 74.28, 74.42, 74.58, 74.86, 75.32], 0.05))).toBeUndefined();
  });
});

describe('sungTimes', () => {
  it('keeps the song\'s own times when the aligner trusted them', () => {
    const starts = [...cue.text].map((_, i) => 73.32 + i * 0.1);
    const r = sungTimes({ ...cue, charStarts: starts, charTimed: true }, [whisper]);
    expect(r.source).toBe('song');
    expect(r.times[17]).toBeCloseTo(75.02, 2);
  });
  it('votes two alignments per character', () => {
    const r = sungTimes(cue, [whisper, mms]);
    expect(r.source).toBe('vote');
    expect(r.votes).toBe(2);
    expect(r.times[17]).toBeCloseTo((74.58 + 74.77) / 2, 1);
  });
  it('takes one alignment as aligned, never going back in time', () => {
    const r = sungTimes(cue, [whisper]);
    expect(r.source).toBe('aligned');
    for (let i = 1; i < r.times.length; i++) expect(r.times[i]).toBeGreaterThanOrEqual(r.times[i - 1]);
  });
  it('falls to the voice, then to an even spread', () => {
    const active = Array.from({ length: 8000 }, (_, f) => f >= 7400 && f < 7580);
    const v = sungTimes(cue, [], { active, fps: 100 });
    expect(v.source).toBe('voice');
    expect(v.times[1]).toBeCloseTo(74, 1);
    const e = sungTimes(cue, []);
    expect(e.source).toBe('even');
    expect(e.times).toEqual(evenSpread(cue));
  });
});

describe('settle and voicedSpread', () => {
  it('gives marks the time of the character before them', () => {
    const t = settle({ text: '哈! 哼', start: 1, end: 2 }, [1.2, undefined, undefined, 1.6]);
    expect(t).toEqual([1.2, 1.2, 1.2, 1.6]);
  });
  it('needs a voiced frame for every character', () => {
    expect(voicedSpread({ text: '三年後的大雪', start: 1, end: 2 }, Array(300).fill(false), 100)).toBeUndefined();
  });
});
