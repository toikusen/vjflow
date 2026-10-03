import { describe, expect, it } from 'vitest';
import { applyTimingEdit, checkLines } from './timing-qa';

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

describe('applyTimingEdit', () => {
  const song: { duration: number; timingConfirmedAt?: string; cues: { id: string; start: number; end: number; confidence: string; review?: string[] }[] } = {
    duration: 60,
    cues: [
      { id: 'c001', start: 10, end: 12, confidence: 'aligned', review: ['對齊信心低'] },
      { id: 'c002', start: 13, end: 15, confidence: 'aligned', review: ['兩種對齊結果不一致'] },
    ],
  };

  it('marks edited lines verified, clamps ends to the next line, confirms on request', () => {
    const r = applyTimingEdit(song, [{ id: 'c001', start: 10.2, end: 14 }, { id: 'c002', start: 13, end: 15 }], false);
    expect(r.cues[0]).toEqual({ id: 'c001', start: 10.2, end: 13, confidence: 'verified' });
    expect(r.cues[1].review).toEqual(['兩種對齊結果不一致']);
    expect(r.timingConfirmedAt).toBeUndefined();
    const c = applyTimingEdit(song, song.cues, true, 'T');
    expect(c.cues.every((x) => !x.review)).toBe(true);
    expect(c.timingConfirmedAt).toBe('T');
    expect(applyTimingEdit(song, song.cues, false, 'T', ['c002']).cues[1]).toEqual({ id: 'c002', start: 13, end: 15, confidence: 'verified' });
  });

  it('rejects edits that are not the song’s lines or are out of order', () => {
    expect(() => applyTimingEdit(song, [song.cues[0]], false)).toThrow(/行數/);
    expect(() => applyTimingEdit(song, [{ id: 'c001', start: 13, end: 14 }, { id: 'c002', start: 13, end: 15 }], false)).toThrow(/晚於上一行/);
    expect(() => applyTimingEdit(song, [{ id: 'c001', start: 10, end: 9 }, song.cues[1]], false)).toThrow(/不合法/);
  });
});
