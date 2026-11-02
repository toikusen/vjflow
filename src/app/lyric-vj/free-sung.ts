// Line times estimated from the audio alone, in the browser and free: where a voice most likely is, the lyrics shared
// out over those stretches by length, starts pulled onto the beat. No alignment happens here: the words are never heard,
// so lines land seconds off (scripts/lyric-vj/free-sung-check.mts has the numbers) and the timing editor is how a person fixes it. Pure over a sample array, so a worker, the
// tests and scripts/lyric-vj/free-sung-check.mts run the same code.
import { Fft } from '../audio/fft';
import type { Rhythm } from './beat-detect';

export interface Stretch { start: number; end: number }

const FFT_SIZE = 2048;
const HOP = 1024;
const VOICE_LOW = 300;
const VOICE_HIGH = 3400;
/** One decision per this much audio, s: a voice is judged over phrases, not frames. */
const STEP = 0.5;
/** Seconds either side a decision looks at. */
const SPAN = 1;
/** Share of a song taken as not sung. */
const STILLEST = 0.15;
const STILL_LEVEL = 0.4;
/** An instrumental gap shorter than this is a breath between lines. */
const MIN_GAP = 1.5;
const MIN_STRETCH = 3;
/** How far a start may move onto a beat, or further onto a downbeat, s. */
const SNAP_BEAT = 0.2;
const SNAP_DOWNBEAT = 0.3;
/** Weight of a line beyond its characters: the time a line takes whatever its length. */
const LINE_BASE = 2;
/** Stretch share kept back at the end of a stretch: its last line does not run to the last note. */
const TAIL = 0.97;

const mean = (xs: Float32Array) => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);

/** Per decision step: how much the voice band keeps changing. A held chord and a steady guitar wall change little, a voice a lot. */
function voiceFlux(samples: Float32Array, rate: number) {
  const frames = Math.max(0, Math.floor((samples.length - FFT_SIZE) / HOP));
  const fft = new Fft(FFT_SIZE);
  const hann = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE));
  const [lo, hi] = [VOICE_LOW, VOICE_HIGH].map((hz) => Math.round((hz * FFT_SIZE) / rate));
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const last = new Float64Array(hi - lo);
  const flux = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = samples[f * HOP + i] * hann[i];
      im[i] = 0;
    }
    fft.transform(re, im);
    let change = 0;
    for (let k = lo; k < hi; k++) {
      const p = Math.log1p((re[k] * re[k] + im[k] * im[k]) * 1e3);
      change += Math.max(0, p - last[k - lo]);
      last[k - lo] = p;
    }
    flux[f] = change / (hi - lo);
  }
  const fps = rate / HOP;
  const steps = Math.floor(samples.length / rate / STEP);
  return Array.from({ length: steps }, (_, i) => mean(flux.subarray(Math.max(0, Math.round((i * STEP - SPAN) * fps)), Math.round((i * STEP + SPAN) * fps))));
}

/** Runs of "on" with short gaps closed and short runs dropped, in seconds. */
function runsOf(on: boolean[]): Stretch[] {
  const runs: Stretch[] = [];
  on.forEach((v, i) => {
    if (!v) return;
    const last = runs.at(-1);
    if (last && i * STEP - last.end < MIN_GAP) last.end = (i + 1) * STEP;
    else runs.push({ start: i * STEP, end: (i + 1) * STEP });
  });
  return runs.filter((r) => r.end - r.start >= MIN_STRETCH);
}

/**
 * Where a voice most likely is: everything but the stillest stretches of voice-band change. Band level was tried and
 * gave no gain on the measured songs (a chorus of guitars is as loud as a voice). An estimate, weakest on a busy
 * instrumental and on a song that never rests. Falls back to the whole audio.
 */
export function sungStretches(samples: Float32Array, rate: number): Stretch[] {
  const score = voiceFlux(samples, rate);
  const whole = [{ start: 0, end: samples.length / rate }];
  if (score.length < 8) return whole;
  const sorted = [...score].sort((a, b) => a - b);
  // a song more than STILLEST silent: what is far under its busy level is not sung either
  const cut = Math.max(sorted[Math.floor(score.length * STILLEST)], STILL_LEVEL * sorted[Math.floor(score.length * 0.75)]);
  const runs = runsOf(score.map((v) => v > cut));
  return runs.length ? runs : whole;
}

/** A start moved onto a downbeat or beat where one is close. */
export function snapToBeat(t: number, r: Pick<Rhythm, 'beats' | 'downbeats'>) {
  const near = (xs: number[], reach: number) => xs.reduce<number | undefined>((best, b) => (Math.abs(b - t) <= reach && (best === undefined || Math.abs(b - t) < Math.abs(best - t)) ? b : best), undefined);
  return near(r.downbeats, SNAP_DOWNBEAT) ?? near(r.beats, SNAP_BEAT) ?? t;
}

/** Start times: the lines shared over the sung stretches by length, in order, each on a beat where one is close. */
export function estimateStarts(texts: readonly string[], stretches: readonly Stretch[], rhythm?: Pick<Rhythm, 'beats' | 'downbeats'>): number[] {
  const weights = texts.map((t) => [...t.replace(/\s/g, '')].length + LINE_BASE);
  const total = weights.reduce((s, v) => s + v, 0);
  const sung = stretches.reduce((s, r) => s + (r.end - r.start), 0);
  const unit = (sung * TAIL) / Math.max(1, total);
  let used = 0;
  return weights.map((w) => {
    let left = used;
    used += w * unit;
    for (const r of stretches) {
      const len = r.end - r.start;
      if (left < len) return rhythm ? snapToBeat(r.start + left, rhythm) : r.start + left;
      left -= len;
    }
    return stretches.at(-1)?.end ?? 0;
  });
}
