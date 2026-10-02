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
