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
  /** Why this line needs a human check in the timing editor (empty/absent = passed the automatic checks). */
  review?: string[];
  /** The other aligner's start when the two disagree: a one-click alternative in the editor. */
  altStart?: number;
  /** When each character (code point of `text`) is sung, for word-by-word reveals. */
  charStarts?: number[];
  /** charStarts come from the audio (forced alignment matched most characters), not interpolation. */
  charTimed?: boolean;
}

export interface SongTimeline {
  title: string;
  duration: number;
  tempo: number;
  beats: number[];
  downbeats: number[];
  sections: { start: number; end: number; energy: number; type?: string }[];
  /** Kick strength per beat 0..1 (beatStrengths), aligned with `beats`. */
  beatStrength?: number[];
  /** Energy at `energyFps`, 0..1, for the director and the renderer. */
  energy: number[];
  energyFps: number;
  cues: TimelineCue[];
  audio: { mix: string; instrumental?: string; instrumentalOffsetSec?: number; vocals?: string };
  timingCheck?: TimingCheck;
  /** Set when a person has checked the lyric timing in the timing editor; generation waits for it. */
  timingConfirmedAt?: string;
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

/**
 * How hard each beat hits (0..1): the low-frequency onset (kick drum) at the beat, normalised by the song's
 * 95th percentile. A one-pole low-pass (~150 Hz) keeps the kick and drops hi-hats and vocals.
 */
export function beatStrengths(samples: Float32Array, sampleRate: number, beats: number[]): number[] {
  const a = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  const low = new Float32Array(samples.length);
  let y = 0;
  for (let i = 0; i < samples.length; i++) low[i] = y += a * (samples[i] - y);
  const hop = 256;
  const env = onsetEnvelope(low, hop);
  const fps = sampleRate / hop;
  const raw = beats.map((b) => {
    let m = 0;
    for (let f = Math.max(0, Math.floor((b - 0.05) * fps)); f <= Math.min(env.length - 1, Math.ceil((b + 0.06) * fps)); f++) m = Math.max(m, env[f]);
    return m;
  });
  const sorted = [...raw].sort((x, z) => x - z);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
  return raw.map((v) => +Math.min(1, v / p95).toFixed(3));
}

const lrcTime = (t: number) => {
  const m = Math.floor(Math.max(0, t) / 60);
  return `${String(m).padStart(2, '0')}:${(Math.max(0, t) - m * 60).toFixed(2).padStart(5, '0')}`;
};

/**
 * The song's lyric timing as LRC: one `[mm:ss.xx]` line per cue, with enhanced-LRC `<mm:ss.xx>` word stamps at each
 * phrase start when the cue has audio-matched character times. Blank stamped lines mark where a line ends before a gap.
 */
export function toLrc(song: Pick<SongTimeline, 'title' | 'cues'>, phraseStarts: (text: string) => number[]): string {
  const out = [`[ti:${song.title}]`];
  const cues = [...song.cues].sort((a, b) => a.start - b.start);
  cues.forEach((c, i) => {
    const chars = [...c.text];
    const body = c.charTimed && c.charStarts
      ? phraseStarts(c.text).map((p, k, all) => ({ p, seg: chars.slice(p, all[k + 1]).join('') })).map(({ p, seg }) => (seg.trim() ? `<${lrcTime(c.charStarts![p])}>${seg}` : seg)).join('')
      : c.text;
    out.push(`[${lrcTime(c.start)}]${body}`);
    const next = cues[i + 1];
    if (!next || next.start - c.end > 1) out.push(`[${lrcTime(c.end)}]`);
  });
  return out.join('\n') + '\n';
}

/**
 * Low-confidence lines (the aligner was unsure) snap to the voice: when the vocal stem starts a phrase after a
 * silence within 0.35 s of the line's start, the line (and its character times) moves there. Lines the aligner was
 * sure of are left alone. Returns the cues and how many moved.
 */
export function snapToVoice(cues: TimelineCue[], active: boolean[], fps = 100): { cues: TimelineCue[]; moved: number } {
  const phrases = phraseStarts(active, fps);
  let moved = 0;
  const out = cues.map((c) => {
    if (!c.review?.includes('對齊信心低')) return c;
    const near = phrases.filter((p) => Math.abs(p - c.start) <= 0.35).sort((a, b) => Math.abs(a - c.start) - Math.abs(b - c.start))[0];
    if (near === undefined || Math.abs(near - c.start) < 0.06) return c;
    const d = near - c.start;
    moved++;
    return { ...c, start: near, end: Math.max(near + 0.4, c.end), charStarts: c.charStarts?.map((x) => +(x + d).toFixed(3)) };
  });
  return { cues: out, moved };
}

/** Voiced stretches [start, end) in seconds: activity runs bridged over gaps shorter than `bridge`. */
export function voicedSpans(active: boolean[], fps = 100, bridge = 0.12): [number, number][] {
  const out: [number, number][] = [];
  const g = Math.round(bridge * fps);
  let i = 0;
  while (i < active.length) {
    if (!active[i]) {
      i++;
      continue;
    }
    let j = i;
    let quiet = 0;
    while (j < active.length && quiet <= g) {
      quiet = active[j] ? 0 : quiet + 1;
      j++;
    }
    out.push([i / fps, (j - quiet) / fps]);
    i = j;
  }
  return out;
}

const visible = (t: string) => [...t.replace(/[\s\p{P}～〜ー~♪]/gu, '')].length;

/**
 * Corrects forced alignment with the vocal stem (the aligner places lines late and lets short shouts drift):
 * - a short line (≤ 5 characters, a shout like てぇてぇ～) takes the voiced stretch between its neighbours nearest
 *   its aligned start;
 * - a line starts where its phrase actually begins: the voice onset up to `early` s before its aligned start, after
 *   the previous line;
 * - a line ends when the voice stops after its last character (never past the next line).
 * Character times shift with their line's start.
 */
export function refineWithVoice(cues: TimelineCue[], active: boolean[], fps = 100, early = 0.75): TimelineCue[] {
  const spans = voicedSpans(active, fps);
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const out: TimelineCue[] = [];
  sorted.forEach((c, i) => {
    const prev = out[i - 1];
    const next = sorted[i + 1];
    const floor = prev ? (prev.charStarts?.at(-1) ?? prev.start) + 0.1 : 0;
    const ceil = next ? next.start : Infinity;
    let start = c.start;
    let end = c.end;
    if (visible(c.text) <= 5) {
      const cand = spans.filter(([s, e]) => e > floor && s < ceil && e - s > 0.15);
      const best = cand.sort((a, b) => Math.abs(a[0] - c.start) - Math.abs(b[0] - c.start))[0];
      if (best) [start, end] = [Math.max(best[0], floor), Math.min(best[1] + 0.2, ceil)];
    } else {
      // the onset of the voiced stretch that holds (or just precedes) the aligned start
      const holder = spans.filter(([s, e]) => s >= floor && s <= c.start + 0.15 && s >= c.start - early && e > s).sort((a, b) => b[0] - a[0])[0];
      if (holder) start = holder[0];
    }
    const d = start - c.start;
    const chars = c.charStarts?.map((x) => +Math.max(start, x + d).toFixed(3));
    const last = chars?.at(-1) ?? start;
    if (visible(c.text) > 5) {
      // end with the voice after the last character
      const stop = spans.find(([s, e]) => e > last && s <= last + 0.3);
      end = Math.min(ceil, Math.max(last + 0.3, stop ? stop[1] + 0.15 : c.end));
    }
    out.push({ ...c, start: +start.toFixed(3), end: +Math.max(start + 0.3, end).toFixed(3), charStarts: chars });
  });
  return out;
}
