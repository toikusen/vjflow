import { describe, expect, it } from 'vitest';
import { applyTimingEdit, checkLines, endAtVoice, silentTail } from './timing-qa';


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
  const song: { duration: number; timingConfirmedAt?: string; singers?: { name: string; color: string }[]; cues: { id: string; start: number; end: number; confidence: string; review?: string[]; singer?: string }[] } = {
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

  it('adds, deletes and retypes lines', () => {
    const withText = { ...song, cues: song.cues.map((c, i) => ({ ...c, text: i ? '二' : '一', charStarts: [c.start] })) };
    const r = applyTimingEdit(withText, [{ id: 'c001', start: 10, end: 12, text: '一番' }, { id: 'n1', start: 20, end: 22, text: ' 新しい ' }], false);
    expect(r.cues.map((c) => c.id)).toEqual(['c001', 'n1']);
    expect(r.cues[0]).toMatchObject({ text: '一番', confidence: 'verified' });
    expect(r.cues[0].charStarts).toBeUndefined();
    expect(r.cues[1]).toMatchObject({ text: '新しい', start: 20, end: 22, confidence: 'verified' });
  });

  it('saves the members and who sings each line', () => {
    const r = applyTimingEdit(song, [{ id: 'c001', start: 10, end: 12, singer: 'Aki' }, { id: 'c002', start: 13, end: 15, singer: '' }], false, 'T', [], [{ name: 'Aki', color: '#FF3366' }]);
    expect(r.singers).toEqual([{ name: 'Aki', color: '#ff3366' }]);
    expect(r.cues[0].singer).toBe('Aki');
    expect(r.cues[1].singer).toBeUndefined();
    expect(() => applyTimingEdit(song, [{ id: 'c001', start: 10, end: 12, singer: 'Nobody' }, song.cues[1]], false, 'T', [], [])).toThrow(/不在成員名單/);
    expect(() => applyTimingEdit(song, song.cues, false, 'T', [], [{ name: 'X', color: 'red' }])).toThrow(/rrggbb/);
  });

  it('rejects edits that are not the song’s lines or are out of order', () => {
    expect(() => applyTimingEdit(song, [], false)).toThrow(/至少/);
    expect(() => applyTimingEdit(song, [{ id: 'new', start: 1, end: 2 }], false)).toThrow(/需要文字/);
    expect(() => applyTimingEdit(song, [song.cues[0], song.cues[0]], false)).toThrow(/重複/);
    expect(() => applyTimingEdit(song, [{ ...song.cues[0], text: '  ' }], false)).toThrow(/不能是空的/);
    expect(() => applyTimingEdit(song, [{ id: 'c001', start: 13, end: 14 }, { id: 'c002', start: 13, end: 15 }], false)).toThrow(/晚於上一行/);
    expect(() => applyTimingEdit(song, [{ id: 'c001', start: 10, end: 9 }, song.cues[1]], false)).toThrow(/不合法/);
  });
});

describe('silentTail', () => {
  // 10 frames a second: voice from 1.0 s to 2.0 s
  const active = Array.from({ length: 60 }, (_, i) => i >= 10 && i < 20);
  it('counts the time a line is up after the voice stops', () => {
    expect(silentTail(active, 1.5, 5, 10)).toBeCloseTo(3);
  });
  it('is nothing while the voice holds until the line leaves', () => {
    expect(silentTail(active, 1.2, 2, 10)).toBe(0);
  });
  it('counts from the last character when no voice is heard after it', () => {
    expect(silentTail(active, 3, 4.5, 10)).toBeCloseTo(1.5);
  });
});

describe('endAtVoice', () => {
  const active = Array.from({ length: 60 }, (_, i) => i >= 10 && i < 20);
  it('pulls an end that runs into silence back to the voice', () => {
    expect(endAtVoice({ start: 1, end: 3.5, charStarts: [1, 1.5] }, active, 10)).toBeCloseTo(2.15);
  });
  it('keeps an end the voice reaches', () => {
    expect(endAtVoice({ start: 1, end: 2, charStarts: [1, 1.5] }, active, 10)).toBe(2);
  });
});
