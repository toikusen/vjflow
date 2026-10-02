// Timeline facts the program owns: downbeats, lyric timing checks against the vocal stem, instrumental offset.
// Pure functions over plain arrays so the Node pipeline and the tests share them.
import { AudioAnalysis } from '../audio/audio-analysis.model';
import { getFeaturesAt } from '../audio/audio-features';

export type TimingSource = 'lrc' | 'lrclib' | 'whisper';
export type TimingConfidence = 'verified' | 'aligned' | 'interpolated';

export interface TimelineCue {
  id: string;
  start: number;
  end: number;
  text: string;
  timingSource: TimingSource;
  confidence: TimingConfidence;
}

export interface SongTimeline {
  title: string;
  duration: number;
  tempo: number;
  beats: number[];
  downbeats: number[];
  sections: { start: number; end: number; energy: number; type?: string }[];
  /** Energy at `energyFps`, 0..1, for the director and the renderer. */
  energy: number[];
  energyFps: number;
  cues: TimelineCue[];
  audio: { mix: string; instrumental?: string; instrumentalOffsetSec?: number };
  timingCheck?: TimingCheck;
}

/** Bar phase (0..3) whose beats carry the most low end: kick drums land on downbeats in most pop. */
export function downbeats(analysis: AudioAnalysis, beatsPerBar = 4): number[] {
  const { beats } = analysis;
  if (beats.length < beatsPerBar) return beats.slice(0, 1);
  let best = 0;
  let bestScore = -Infinity;
  for (let phase = 0; phase < beatsPerBar; phase++) {
    let score = 0;
    for (let i = phase; i < beats.length; i += beatsPerBar) score += getFeaturesAt(analysis, beats[i]).bass;
    score /= Math.ceil((beats.length - phase) / beatsPerBar);
    if (score > bestScore) [best, bestScore] = [phase, score];
  }
  return beats.filter((_, i) => i % beatsPerBar === best);
}

/** Frame-wise "someone is singing" mask from a vocal stem: RMS above 20 % of its 95th percentile. */
export function vocalActivity(samples: Float32Array, sampleRate: number, fps = 100): boolean[] {
  const hop = Math.round(sampleRate / fps);
  const rms: number[] = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + hop; j++) s += samples[j] * samples[j];
    rms.push(Math.sqrt(s / hop));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  return rms.map((v) => v > 0.2 * p95);
}

/** Times where singing resumes after at least `gap` s of silence. */
export function phraseStarts(active: boolean[], fps = 100, gap = 0.12): number[] {
  const g = Math.round(gap * fps);
  const out: number[] = [];
  for (let i = g; i < active.length; i++) {
    if (!active[i]) continue;
    let silent = true;
    for (let j = i - g; j < i && silent; j++) if (active[j]) silent = false;
    if (silent) out.push(i / fps);
  }
  return out;
}

export interface TimingCheck {
  /** Share of cues with singing within 0.4 s of their start. */
  startOnVocal: number;
  /** Mean |start − nearest phrase start| over cues that have one within ±1 s. */
  meanShiftSec: number;
  checkedCues: number;
  passed: boolean;
}

/** The spec's gate for externally timed lyrics (LRCLIB): ≥ 85 % starts on voice and mean shift ≤ 0.3 s. */
export function checkTiming(cues: { start: number }[], active: boolean[], fps = 100): TimingCheck {
  const phrases = phraseStarts(active, fps);
  let onVocal = 0;
  const shifts: number[] = [];
  for (const c of cues) {
    const a = Math.floor(c.start * fps);
    const b = Math.floor((c.start + 0.4) * fps);
    if (active.slice(a, b).some(Boolean)) onVocal++;
    const near = phrases.filter((p) => Math.abs(p - c.start) <= 1);
    if (near.length) shifts.push(Math.min(...near.map((p) => Math.abs(p - c.start))));
  }
  const startOnVocal = cues.length ? onVocal / cues.length : 0;
  const meanShiftSec = shifts.length ? shifts.reduce((s, x) => s + x, 0) / shifts.length : 0;
  return { startOnVocal, meanShiftSec, checkedCues: shifts.length, passed: startOnVocal >= 0.85 && meanShiftSec <= 0.3 };
}

/** Onset-strength envelope (positive energy flux) at `hop` samples. */
export function onsetEnvelope(samples: Float32Array, hop = 256): Float32Array {
  const n = Math.floor(samples.length / hop);
  const env = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) s += samples[j] * samples[j];
    const e = Math.sqrt(s / hop);
    env[i] = Math.max(0, e - prev);
    prev = e;
  }
  return env;
}

/**
 * Seconds to delay `other` so it lines up with `ref` (negative: trim its start).
 * Coarse lag from onset envelopes (±maxLag), refined sample-accurately by waveform correlation.
 */
export function alignOffset(ref: Float32Array, other: Float32Array, sampleRate: number, maxLag = 2): number {
  const hop = 256;
  const ea = onsetEnvelope(ref, hop);
  const eb = onsetEnvelope(other, hop);
  const n = Math.min(ea.length, eb.length);
  const m = Math.round((maxLag * sampleRate) / hop);
  let coarse = 0;
  let best = -Infinity;
  for (let k = -m; k <= m; k++) {
    let s = 0;
    for (let i = Math.max(0, k); i < n + Math.min(0, k); i++) s += ea[i] * eb[i - k];
    if (s > best) [coarse, best] = [k, s];
  }
  // refine on a 20 s window from the middle of the track, ±1 hop around the coarse lag
  const lag0 = coarse * hop;
  const from = Math.floor(ref.length / 2 - 10 * sampleRate);
  const len = Math.min(20 * sampleRate, ref.length - from - hop * 2);
  let fine = lag0;
  best = -Infinity;
  for (let k = lag0 - hop; k <= lag0 + hop; k++) {
    let s = 0;
    for (let i = from; i < from + len; i += 2) {
      const j = i - k;
      if (j >= 0 && j < other.length) s += ref[i] * other[j];
    }
    if (s > best) [fine, best] = [k, s];
  }
  return fine / sampleRate;
}
