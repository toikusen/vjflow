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
