import { describe, expect, it } from 'vitest';
import { AudioAnalysis } from '../audio/audio-analysis.model';
import { alignOffset, checkTiming, downbeats, phraseStarts, vocalActivity } from './timeline';

function analysisWithKickEvery4(phase: number): AudioAnalysis {
  const beats = Array.from({ length: 16 }, (_, i) => i * 0.5);
  const frames = Array.from({ length: 200 }, (_, i) => {
    const t = i * 0.05;
    const beat = Math.round(t / 0.5);
    const onBeat = Math.abs(t - beat * 0.5) < 0.03;
    return { time: t, energy: 0.5, bass: onBeat && beat % 4 === phase ? 1 : 0.1, mid: 0.3, treble: 0.3 };
  });
  return { duration: 10, frameInterval: 0.05, frames, beats, tempo: 120, sections: [], summary: { chroma: [], centroidHz: 0 } };
}

describe('downbeats', () => {
  it('picks the bar phase where the kick lands', () => {
    expect(downbeats(analysisWithKickEvery4(2))).toEqual([1, 3, 5, 7]);
  });
});

describe('vocal activity and phrase starts', () => {
  const sr = 1000;
  const samples = new Float32Array(sr * 4);
  for (let i = sr * 1; i < sr * 2; i++) samples[i] = 0.5; // sing 1–2 s
  for (let i = sr * 2.5; i < sr * 3.5; i++) samples[i] = 0.5; // breath, sing 2.5–3.5 s
  const active = vocalActivity(samples, sr);

  it('finds where singing resumes after silence', () => {
    expect(phraseStarts(active)).toEqual([1, 2.5]);
  });

  it('passes cues that start on the voice and fails late ones', () => {
    expect(checkTiming([{ start: 1 }, { start: 2.5 }], active).passed).toBe(true);
    const late = checkTiming([{ start: 1.6 }, { start: 3.2 }], active);
    expect(late.meanShiftSec).toBeCloseTo(0.65, 2);
    expect(late.passed).toBe(false);
  });
});

describe('alignOffset', () => {
  it('measures how much the other track must be delayed', () => {
    const sr = 4000;
    const ref = new Float32Array(sr * 40);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    // irregular bursts: a periodic test signal would have several equally good lags
    let next = 0;
    for (let i = 0; i < ref.length; i++) {
      if (i >= next) next = i + 900 + Math.floor((rnd() + 0.5) * 2500);
      ref[i] = (next - i < 200 ? 1 : 0.1) * rnd();
    }
    const lag = 184; // other starts 46 ms early
    const other = new Float32Array(ref.length);
    for (let i = 0; i < ref.length - lag; i++) other[i] = ref[i + lag];
    expect(alignOffset(ref, other, sr)).toBeCloseTo(lag / sr, 3);
  });
});

describe('toLrc', () => {
  it('writes line stamps, word stamps for char-timed lines and a blank line before a gap', async () => {
    const { toLrc } = await import('./timeline');
    const lrc = toLrc({ title: 't', cues: [
      { id: 'a', start: 1.5, end: 3, text: 'ab cd', timingSource: 'whisper', confidence: 'aligned', charStarts: [1.5, 1.7, 2, 2.2, 2.4], charTimed: true },
      { id: 'b', start: 70, end: 72, text: 'ef', timingSource: 'whisper', confidence: 'aligned' },
    ] }, () => [0, 3]);
    expect(lrc).toBe('[ti:t]\n[00:01.50]<00:01.50>ab <00:02.20>cd\n[00:03.00]\n[01:10.00]ef\n[01:12.00]\n');
  });

  it('carries rounding across a minute', async () => {
    const { toLrc } = await import('./timeline');
    expect(toLrc({ title: 't', cues: [{ id: 'a', start: 59.9996, end: 61, text: '光', timingSource: 'lrc', confidence: 'verified' }] }, () => [0])).toContain('[01:00.00]光');
  });
});

describe('toSrt', () => {
  const cue = (start: number, end: number, text: string) => ({ id: text, start, end, text, timingSource: 'lrc' as const, confidence: 'verified' as const });

  it('numbers blocks in time order with millisecond stamps that carry', async () => {
    const { toSrt } = await import('./timeline');
    expect(toSrt([cue(3661.0005, 3662, 'b'), cue(59.9996, 61, '光')])).toBe('1\n00:01:00,000 --> 00:01:01,000\n光\n\n2\n01:01:01,001 --> 01:01:02,000\nb\n');
  });
});

describe('exportIssues', () => {
  const cue = (start: number, end: number, text: string) => ({ id: text, start, end, text, timingSource: 'lrc' as const, confidence: 'verified' as const });

  it('reports lines that share an LRC stamp or lose their length or overlap in SRT', async () => {
    const { exportIssues } = await import('./timeline');
    expect(exportIssues([cue(1, 2, 'a'), cue(3, 4, 'b')])).toEqual([]);
    expect(exportIssues([cue(1, 1.0004, 'a'), cue(1.004, 2, 'b')])).toEqual([
      '第 1 行在 SRT 會變成零長度',
      '第 1、2 行在 LRC 的開始時間相同',
    ]);
    expect(exportIssues([cue(1, 2.5, 'a'), cue(2, 3, 'b')])).toEqual(['第 1、2 行在 SRT 重疊']);
  });
});

describe('keepUserTiming', () => {
  const cue = (id: string, start: number, confidence: 'verified' | 'aligned') => ({ id, start, end: start + 1, text: id, timingSource: 'lrc' as const, confidence });
  const song = (cues: ReturnType<typeof cue>[], extra = {}) => ({ title: 't', duration: 10, tempo: 120, cues, ...extra }) as never;

  it('keeps a confirmed or hand-edited timeline over a fresh automatic one', async () => {
    const { keepUserTiming } = await import('./timeline');
    const fresh = song([cue('x', 5, 'aligned')]);
    const confirmed = song([cue('a', 1, 'aligned')], { timingConfirmedAt: 'now', singers: [{ name: 'A', color: '#ffffff' }] });
    const edited = song([cue('a', 1, 'verified')]);
    expect(keepUserTiming(confirmed, fresh)).toMatchObject({ cues: [{ id: 'a' }], timingConfirmedAt: 'now', singers: [{ name: 'A' }] });
    expect(keepUserTiming(edited, fresh)).toMatchObject({ cues: [{ id: 'a' }] });
    expect(keepUserTiming(song([cue('a', 1, 'aligned')]), fresh)).toBe(fresh);
    expect(keepUserTiming(undefined, fresh)).toBe(fresh);
  });
});

describe('snapToVoice', () => {
  it('moves only low-confidence lines to a nearby vocal phrase start', async () => {
    const { snapToVoice } = await import('./timeline');
    const active = Array.from({ length: 400 }, (_, i) => i >= 120); // voice enters at 1.2 s after silence
    const cue = (id: string, start: number, review?: string[]) => ({ id, start, end: start + 2, text: 'x', timingSource: 'whisper' as const, confidence: 'aligned' as const, review, charStarts: [start] });
    const r = snapToVoice([cue('a', 1.0, ['對齊信心低']), cue('b', 1.0)], active);
    expect(r.moved).toBe(1);
    expect(r.cues[0].start).toBeCloseTo(1.2, 2);
    expect(r.cues[0].charStarts![0]).toBeCloseTo(1.2, 2);
    expect(r.cues[1].start).toBe(1.0);
  });
});

describe('keepGivenStarts', () => {
  it('puts back a line the word alignment moved far from the given timing and keeps the small moves', async () => {
    const { keepGivenStarts } = await import('./timeline');
    const cue = (id: string, start: number, end: number) => ({ id, start, end, text: 'x', timingSource: 'lrclib' as const, confidence: 'verified' as const, charStarts: [start] });
    const given = [cue('a', 70, 72), cue('b', 89.2, 90.4), cue('c', 90.4, 92)];
    const aligned = [cue('a', 70.3, 71.7), cue('b', 71.7, 72.1), cue('c', 72.1, 75)];
    const r = keepGivenStarts(given, aligned);
    expect(r.kept).toBe(2);
    expect(r.cues.map((c) => [c.id, c.start])).toEqual([['a', 70.3], ['b', 89.2], ['c', 90.4]]);
    expect(r.cues[1].charStarts).toBeUndefined();
  });

  it('gives the line before a restored one back the end the early start had cut, and its character times stay inside', async () => {
    const { keepGivenStarts } = await import('./timeline');
    const cue = (id: string, start: number, end: number, charStarts?: number[]) => ({ id, start, end, text: 'xx', timingSource: 'lrclib' as const, confidence: 'verified' as const, charStarts });
    const given = [cue('a', 8, 12), cue('b', 12, 14)];
    const aligned = [cue('a', 8, 10.3, [8, 11.543]), cue('b', 10.3, 14)];
    const r = keepGivenStarts(given, aligned);
    expect(r.cues.map((c) => [c.id, c.start, c.end])).toEqual([['a', 8, 12], ['b', 12, 14]]);
    expect(r.cues[0].charStarts).toEqual([8, 11.543]);
    // character times past the line's own end are dropped rather than kept beyond it
    const cut = keepGivenStarts([cue('a', 8, 10), cue('b', 10, 14)], [cue('a', 8, 8.5, [8, 11.5]), cue('b', 8.5, 14)]);
    expect(cut.cues[0].end).toBe(10);
    expect(cut.cues[0].charStarts).toBeUndefined();
  });
});

describe('holdToVoice', () => {
  it('keeps a held last note on screen until the voice stops, never past the next line', async () => {
    const { holdToVoice } = await import('./timeline');
    const active = Array.from({ length: 3000 }, (_, f) => f >= 1000 && f < 1900); // voice 10–19 s
    const cues = [
      { id: 'a', start: 10, end: 14, text: 'x' },
      { id: 'b', start: 25, end: 27, text: 'y' },
    ] as Parameters<typeof holdToVoice>[0];
    const r = holdToVoice(cues, active);
    expect(r.cues[0].end).toBeCloseTo(19.2, 1);
    expect(r.cues[1].end).toBe(27); // no voice at its end: unchanged
    const tight = holdToVoice([{ ...cues[0] }, { ...cues[1], start: 16 }] as typeof cues, active);
    expect(tight.cues[0].end).toBeCloseTo(15.9, 1);
  });
});

describe('placeInVoice', () => {
  it('moves a line off silence to the next voice onset, drops one with no room', async () => {
    const { placeInVoice } = await import('./timeline');
    // voice 0–5 s and 9–12 s
    const active = Array.from({ length: 1500 }, (_, f) => f < 500 || (f >= 900 && f < 1200));
    const cues = [
      { id: 'a', start: 1, end: 4, text: 'x' },
      { id: 'b', start: 6, end: 6.5, text: 'y' }, // in the gap
      { id: 'c', start: 9.5, end: 11.5, text: 'z' },
      { id: 'd', start: 12.5, end: 14, text: 'w' }, // after the last voice
    ] as Parameters<typeof placeInVoice>[0];
    const r = placeInVoice(cues, active);
    expect(r.moved).toEqual(['b']);
    expect(r.dropped).toEqual(['d']);
    expect(r.cues.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(r.cues[1].start).toBeCloseTo(9, 1);
    expect(r.cues[1].end).toBeCloseTo(9.45, 2);
  });
});

describe('keepLyricOrder', () => {
  it('re-times a line placed ahead of the one before it, and the lines it overlaps, by character count', async () => {
    const { keepLyricOrder } = await import('./timeline');
    const cues = [
      { id: 'a', start: 0, end: 2, text: 'xx' },
      { id: 'b', start: 3, end: 9, text: 'aaaa' },
      { id: 'c', start: 9, end: 9.5, text: 'bbbb' }, // 0.5 s chant after b
      { id: 'd', start: 7, end: 11, text: 'cccccccc' }, // starts before c, inside b
      { id: 'e', start: 12, end: 13, text: 'yy' },
    ] as Parameters<typeof keepLyricOrder>[0];
    const r = keepLyricOrder(cues);
    expect(r.reflowed).toEqual(['b', 'c', 'd']);
    expect(r.cues.map((c) => [c.start, c.end])).toEqual([[0, 2], [3, 5], [5, 7], [7, 11], [12, 13]]);
  });

  it('leaves lines in order alone', async () => {
    const { keepLyricOrder } = await import('./timeline');
    const cues = [{ id: 'a', start: 0, end: 1, text: 'ドドドド' }, { id: 'b', start: 1, end: 3, text: 'xx' }] as Parameters<typeof keepLyricOrder>[0];
    expect(keepLyricOrder(cues).reflowed).toEqual([]);
  });
});

describe('feltTempo', () => {
  const beats = Array.from({ length: 40 }, (_, i) => i * 0.4); // 150 BPM
  it('halves a doubled tempo of a slow song, keeping the beats on the downbeats', async () => {
    const { feltTempo } = await import('./timeline');
    const cues = [{ id: 'a', start: 0, end: 6, text: '重ねたすべては' }] as Parameters<typeof feltTempo>[0]['cues'];
    const r = feltTempo({ tempo: 150, beats, downbeats: [0.4, 2, 3.6], cues });
    expect(r.halved).toBe(true);
    expect(r.tempo).toBe(75);
    expect(r.beats[0]).toBeCloseTo(0.4);
  });
  it('leaves a busy line alone', async () => {
    const { feltTempo } = await import('./timeline');
    const cues = [{ id: 'a', start: 0, end: 2, text: 'のんののんのんのんののんふぃく' }] as Parameters<typeof feltTempo>[0]['cues'];
    expect(feltTempo({ tempo: 150, beats, downbeats: [], cues }).halved).toBe(false);
  });
});

