// Beats and tempo from decoded audio, in the browser and with no server. The standard chain: a log-band spectral-flux
// onset envelope (Bello et al. 2005), the envelope's autocorrelation weighted towards a likely tempo, then a
// dynamic-programming beat tracker (Ellis 2007). Pure over a sample array, so a worker, the tests and
// scripts/lyric-vj/beat-check.mts all run the same code.
import { Fft } from '../audio/fft';
import { beatStrengths } from './timeline';

export interface Rhythm {
  tempo: number;
  beats: number[];
  downbeats: number[];
  beatStrength: number[];
  /** How clearly the song repeats at this tempo, 0..1: the autocorrelation at the beat over the one at no lag. */
  confidence: number;
}

/** The rate the audio is decoded to for this: bands to 11 kHz are plenty, and a song stays small. */
export const BEAT_RATE = 22050;
const FFT_SIZE = 1024;
const HOP = 220;
const BANDS = 24;
const LOW_HZ = 40;
/** Frames back the flux compares with: long enough that a soft attack still shows as a rise. */
const FLUX_LAG = 3;
const MIN_BPM = 60;
const MAX_BPM = 200;
/** The tempo people tend to feel, and how far from it (in octaves) a candidate fades. */
const PRIOR_BPM = 120;
const PRIOR_OCTAVES = 0.9;
/** Under this the audio is too short to hear a repeat in. */
const MIN_SECONDS = 6;
/** Under this there is no pulse to speak of: speech, an ambient piece, silence. */
const MIN_CONFIDENCE = 0.04;
const TIGHTNESS = 100;

/** Where a frame's onset really is, s: half a window after its first sample, less the rise the flux reacts to first. */
const frameTime = (f: number, rate: number) => (f * HOP + FFT_SIZE * 0.32) / rate;

/** FFT bin ranges of log-spaced bands from LOW_HZ to the top. */
function bandEdges(rate: number) {
  const top = Math.min(11000, rate / 2);
  const edges = Array.from({ length: BANDS + 1 }, (_, i) => Math.round((LOW_HZ * (top / LOW_HZ) ** (i / BANDS) * FFT_SIZE) / rate));
  return edges.slice(0, -1).map((lo, i) => [lo, Math.max(lo + 1, edges[i + 1])] as const);
}

/** How much new sound starts at each frame: rises in the log band energies, the local level taken off. */
export function onsetEnvelope(samples: Float32Array, rate: number): { env: Float32Array; fps: number } {
  const fps = rate / HOP;
  const frames = Math.max(0, Math.floor((samples.length - FFT_SIZE) / HOP) + 1);
  const fft = new Fft(FFT_SIZE);
  const hann = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE));
  const edges = bandEdges(rate);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const bands = new Float32Array(frames * BANDS);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    const at = f * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = samples[at + i] * hann[i];
      im[i] = 0;
    }
    fft.transform(re, im);
    edges.forEach(([lo, hi], b) => {
      let p = 0;
      for (let k = lo; k < hi; k++) p += re[k] * re[k] + im[k] * im[k];
      bands[f * BANDS + b] = p / (hi - lo);
      if (bands[f * BANDS + b] > peak) peak = bands[f * BANDS + b];
    });
  }
  const floor = peak * 1e-6 || 1e-12;
  for (let i = 0; i < bands.length; i++) bands[i] = Math.log(bands[i] + floor);
  const flux = new Float32Array(frames);
  for (let f = FLUX_LAG; f < frames; f++) {
    let s = 0;
    for (let b = 0; b < BANDS; b++) s += Math.max(0, bands[f * BANDS + b] - bands[(f - FLUX_LAG) * BANDS + b]);
    flux[f] = s;
  }
  return { env: removeLocalLevel(flux, Math.round(fps * 0.4)), fps };
}

/** The envelope less its moving mean, floored at zero and scaled to unit deviation. */
function removeLocalLevel(flux: Float32Array, half: number) {
  const sum = new Float64Array(flux.length + 1);
  flux.forEach((v, i) => (sum[i + 1] = sum[i] + v));
  const out = flux.map((v, i) => {
    const [a, b] = [Math.max(0, i - half), Math.min(flux.length, i + half + 1)];
    return Math.max(0, v - (sum[b] - sum[a]) / (b - a));
  });
  const mean = out.reduce((s, v) => s + v, 0) / Math.max(1, out.length);
  const sd = Math.sqrt(out.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, out.length));
  return sd > 0 ? out.map((v) => v / sd) : out;
}

/** Autocorrelation per frame of overlap, lags 0..maxLag. */
function autocorrelate(env: Float32Array, maxLag: number) {
  const acf = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    acf[lag] = s / Math.max(1, env.length - lag);
  }
  return acf;
}

/** The sub-frame peak of `y` around index i. */
const refine = (y: ArrayLike<number>, i: number) => {
  const [a, b, c] = [y[i - 1] ?? 0, y[i], y[i + 1] ?? 0];
  const d = a - 2 * b + c;
  return d < 0 ? i + (0.5 * (a - c)) / d : i;
};

/** The beat period in frames: the lag whose multiples all repeat, nudged towards the tempo people feel. */
export function beatPeriod(env: Float32Array, fps: number): { period: number; confidence: number } {
  const [lo, hi] = [Math.floor((60 / MAX_BPM) * fps), Math.ceil((60 / MIN_BPM) * fps)];
  const acf = autocorrelate(env, hi * 4 + 2);
  const score = new Float64Array(hi + 2);
  const mean = acf.slice(lo).reduce((s, v) => s + v, 0) / Math.max(1, acf.length - lo);
  for (let lag = lo; lag <= hi; lag++) {
    // a pulse repeats at twice and four times its period too; a lucky single lag does not
    const comb = acf[lag] + 0.5 * acf[lag * 2] + 0.25 * acf[lag * 4];
    const octaves = Math.log2((60 * fps) / lag / PRIOR_BPM) / PRIOR_OCTAVES;
    score[lag] = Math.max(0, comb / 1.75 - mean) * Math.exp(-0.5 * octaves * octaves);
  }
  let best = lo;
  for (let lag = lo; lag <= hi; lag++) if (score[lag] > score[best]) best = lag;
  if (score[best] <= 0) return { period: (60 / PRIOR_BPM) * fps, confidence: 0 };
  return { period: refine(score, best), confidence: Math.max(0, Math.min(1, (acf[best] - mean) / (acf[0] || 1))) };
}

/** Frames of the best chain of beats: each lands on an onset, and steps close to one period from the last. */
function trackBeats(env: Float32Array, period: number) {
  const n = env.length;
  const score = Float64Array.from(env);
  const back = new Int32Array(n).fill(-1);
  const [lo, hi] = [Math.round(period / 2), Math.round(period * 2)];
  const cost = Float64Array.from({ length: hi + 1 }, (_, d) => (d ? TIGHTNESS * Math.log(d / period) ** 2 : Infinity));
  for (let t = lo; t < n; t++) {
    let bestVal = 0;
    for (let d = lo; d <= hi && d <= t; d++) {
      const v = score[t - d] - cost[d];
      if (v > bestVal) {
        bestVal = v;
        back[t] = t - d;
      }
    }
    score[t] += bestVal;
  }
  let t = Math.max(0, n - Math.round(period));
  for (let i = t; i < n; i++) if (score[i] > score[t]) t = i;
  const chain: number[] = [];
  for (; t >= 0; t = back[t]) chain.push(t);
  return chain.reverse();
}

/** A quiet passage breaks the chain: the grid carries on through it, and out to both ends of the song. */
function fillGrid(chain: number[], period: number, frames: number) {
  const out: number[] = [];
  for (let t = chain[0] - period; t >= 0; t -= period) out.unshift(t);
  chain.forEach((f, i) => {
    out.push(f);
    const next = chain[i + 1] ?? frames + period;
    const steps = Math.round((next - f) / period);
    for (let k = 1; k < steps; k++) out.push(f + ((next - f) * k) / steps);
  });
  return out.filter((f) => f < frames);
}

/** Every fourth beat, from the one of the four phases that hits hardest. */
function barStarts(beats: number[], strength: number[]) {
  const sums = [0, 1, 2, 3].map((p) => strength.reduce((s, v, i) => (i % 4 === p ? s + v : s), 0));
  const phase = sums.indexOf(Math.max(...sums));
  return beats.filter((_, i) => i % 4 === phase);
}

/** The rhythm of a mono signal, or undefined when it has none to find: too short, silent, or no steady pulse. */
export function detectBeats(samples: Float32Array, rate: number): Rhythm | undefined {
  if (samples.length < MIN_SECONDS * rate) return undefined;
  const { env, fps } = onsetEnvelope(samples, rate);
  const { period, confidence } = beatPeriod(env, fps);
  if (confidence < MIN_CONFIDENCE) return undefined;
  const chain = trackBeats(env, period);
  if (chain.length < 4) return undefined;
  const beats = fillGrid(chain, period, env.length).map((f) => +frameTime(f, rate).toFixed(3));
  const beatStrength = beatStrengths(samples, rate, beats);
  return { tempo: +((60 * fps) / period).toFixed(2), beats, downbeats: barStarts(beats, beatStrength), beatStrength, confidence: +confidence.toFixed(3) };
}
