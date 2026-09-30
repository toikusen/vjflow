import { Injectable } from '@angular/core';
import { AudioAnalysis, AudioBufferLike, AudioFeatureFrame, AudioSection, SectionType } from './audio-analysis.model';
import { Fft } from './fft';

const FFT_SIZE = 2048;
const HOP = 1024;
const BASS_HZ: [number, number] = [30, 160];
const MID_HZ: [number, number] = [160, 2500];
const TREBLE_HZ: [number, number] = [2500, 11000];
const FRAMES_PER_YIELD = 400;

export type ProgressFn = (progress: number) => void;

/**
 * Pre-analyzes a whole track once: RMS, band energies, spectral flux,
 * beat grid (tempo + dynamic-programming tracking) and coarse sections.
 * Yields to the event loop periodically so the UI stays responsive.
 */
export async function analyzeAudio(buffer: AudioBufferLike, onProgress: ProgressFn = () => {}): Promise<AudioAnalysis> {
  const sr = buffer.sampleRate;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const n = buffer.length;
  const frameCount = Math.floor(n / HOP) + 1;
  const frameInterval = HOP / sr;

  const fft = new Fft(FFT_SIZE);
  const window = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const bins = FFT_SIZE / 2;
  const logMag = new Float64Array(bins);
  const prevLogMag = new Float64Array(bins);
  const binOf = (hz: number) => Math.min(bins - 1, Math.max(1, Math.round((hz * FFT_SIZE) / sr)));
  const bands = [BASS_HZ, MID_HZ, TREBLE_HZ].map(([lo, hi]) => [binOf(lo), binOf(hi)] as const);

  const energy = new Float32Array(frameCount);
  const bass = new Float32Array(frameCount);
  const mid = new Float32Array(frameCount);
  const treble = new Float32Array(frameCount);
  const flux = new Float32Array(frameCount);
  const inv = 1 / channels.length;

  for (let f = 0; f < frameCount; f++) {
    const offset = f * HOP - FFT_SIZE / 2;
    let sumSq = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = offset + i;
      let v = 0;
      if (s >= 0 && s < n) {
        for (const ch of channels) v += ch[s];
        v *= inv;
      }
      sumSq += v * v;
      re[i] = v * window[i];
      im[i] = 0;
    }
    energy[f] = Math.sqrt(sumSq / FFT_SIZE);
    fft.transform(re, im);

    let fx = 0;
    for (let k = 1; k < bins; k++) {
      const mag = Math.hypot(re[k], im[k]);
      logMag[k] = Math.log1p(100 * mag);
      const d = logMag[k] - prevLogMag[k];
      if (d > 0 && f > 0) fx += d;
      prevLogMag[k] = logMag[k];
    }
    flux[f] = fx;
    const bandOut = [bass, mid, treble];
    for (let b = 0; b < 3; b++) {
      const [lo, hi] = bands[b];
      let p = 0;
      for (let k = lo; k <= hi; k++) p += re[k] * re[k] + im[k] * im[k];
      bandOut[b][f] = Math.sqrt(p / (hi - lo + 1));
    }

    if (f % FRAMES_PER_YIELD === FRAMES_PER_YIELD - 1) {
      onProgress((f / frameCount) * 0.9);
      await yieldToEventLoop();
    }
  }

  [energy, bass, mid, treble, flux].forEach(normalizeInPlace);

  const tempoPeriod = estimatePeriod(flux, frameInterval);
  const beatFrames = trackBeats(onsetEnvelope(flux), tempoPeriod);
  const beats = beatFrames.map((f) => f * frameInterval);

  const frames: AudioFeatureFrame[] = new Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    frames[f] = { time: f * frameInterval, energy: energy[f], bass: bass[f], mid: mid[f], treble: treble[f], spectralFlux: flux[f] };
  }
  const duration = n / sr;
  const sections = detectSections(frames, frameInterval, duration, beats);
  onProgress(1);
  return { duration, frameInterval, frames, beats, tempo: 60 / (tempoPeriod * frameInterval), sections };
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function percentile(values: ArrayLike<number>, p: number): number {
  if (!values.length) return 0;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
}

/** Scales so the 95th percentile maps to 1, then clamps. Robust against single peaks. */
function normalizeInPlace(values: Float32Array): void {
  const ref = percentile(values, 0.95) || values.reduce((m, v) => Math.max(m, v), 0) || 1;
  for (let i = 0; i < values.length; i++) values[i] = Math.min(1, values[i] / ref);
}

/** Flux minus its local mean, half-wave rectified — emphasizes onsets over sustained loudness. */
function onsetEnvelope(flux: Float32Array): Float32Array {
  const n = flux.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + flux[i];
  const w = 8;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(n, i + w + 1);
    out[i] = Math.max(0, flux[i] - (prefix[b] - prefix[a]) / (b - a));
  }
  return out;
}

/** Beat period in frames via autocorrelation weighted towards ~120 BPM. */
function estimatePeriod(onset: Float32Array, frameInterval: number): number {
  const minLag = Math.floor(60 / 180 / frameInterval);
  const maxLag = Math.ceil(60 / 70 / frameInterval);
  const preferred = 60 / 120 / frameInterval;
  const len = Math.min(onset.length, Math.round(90 / frameInterval));
  let best = preferred;
  let bestScore = 0;
  const scores = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = lag; i < len; i++) s += onset[i] * onset[i - lag];
    scores[lag] = s * Math.exp(-0.5 * Math.log2(lag / preferred) ** 2 / 0.9 ** 2);
  }
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (scores[lag] > bestScore && scores[lag] >= scores[lag - 1] && scores[lag] >= scores[lag + 1]) {
      bestScore = scores[lag];
      // Parabolic interpolation for a sub-frame period estimate.
      const a = scores[lag - 1];
      const b = scores[lag];
      const c = scores[lag + 1];
      const denom = a - 2 * b + c;
      best = lag + (denom ? (0.5 * (a - c)) / denom : 0);
    }
  }
  return best;
}

/** Dynamic-programming beat tracker (Ellis 2007). Returns beat frame indices. */
export function trackBeats(onset: Float32Array, period: number, tightness = 100): number[] {
  const n = onset.length;
  if (n === 0) return [];
  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const lo = Math.round(period / 2);
  const hi = Math.round(period * 2);
  for (let t = 0; t < n; t++) {
    let bestPrev = -1;
    let bestVal = -Infinity;
    for (let prev = t - hi; prev <= t - lo; prev++) {
      if (prev < 0) continue;
      const penalty = Math.log((t - prev) / period);
      const v = score[prev] - tightness * penalty * penalty;
      if (v > bestVal) {
        bestVal = v;
        bestPrev = prev;
      }
    }
    score[t] = onset[t] + (bestPrev >= 0 ? Math.max(0, bestVal) : 0);
    back[t] = bestVal > 0 ? bestPrev : -1;
  }
  let t = n - 1;
  for (let i = Math.max(0, n - Math.round(period)); i < n; i++) if (score[i] > score[t]) t = i;
  const beats: number[] = [];
  while (t >= 0) {
    beats.push(t);
    t = back[t];
  }
  beats.reverse();
  return fillBeatGaps(beats, period, n);
}

/** Silent passages break the DP chain; extend the grid so beatPulse never stalls. */
function fillBeatGaps(beats: number[], period: number, n: number): number[] {
  const out: number[] = [];
  let prev = beats.length ? beats[0] : 0;
  for (let t = prev - period; t >= 0; t -= period) out.unshift(Math.round(t));
  for (const b of beats) {
    for (let t = prev + period; b - t > period * 0.5; t += period) out.push(Math.round(t));
    out.push(b);
    prev = b;
  }
  for (let t = prev + period; t < n; t += period) out.push(Math.round(t));
  return out.filter((b, i) => i === 0 || b > out[i - 1]);
}

const MIN_SECTION = 10;

/** Splits the track at large, sustained changes of loudness and labels the parts heuristically. */
export function detectSections(frames: AudioFeatureFrame[], frameInterval: number, duration: number, beats: number[]): AudioSection[] {
  const secs = Math.max(1, Math.ceil(duration));
  const level = new Float64Array(secs);
  const counts = new Float64Array(secs);
  for (const f of frames) {
    const s = Math.min(secs - 1, Math.floor(f.time));
    level[s] += 0.6 * f.energy + 0.4 * f.bass;
    counts[s]++;
  }
  for (let s = 0; s < secs; s++) level[s] = counts[s] ? level[s] / counts[s] : 0;

  const L = 8;
  const mean = (a: number, b: number) => {
    let sum = 0;
    for (let i = a; i < b; i++) sum += level[i];
    return sum / Math.max(1, b - a);
  };
  const candidates: { t: number; novelty: number }[] = [];
  for (let s = L; s <= secs - L; s++) {
    candidates.push({ t: s, novelty: Math.abs(mean(s - L, s) - mean(s, s + L)) });
  }
  candidates.sort((a, b) => b.novelty - a.novelty);

  const maxBoundaries = Math.floor(duration / 12);
  const boundaries: number[] = [];
  for (const c of candidates) {
    if (boundaries.length >= maxBoundaries || c.novelty < 0.04) break;
    if (c.t < MIN_SECTION || duration - c.t < MIN_SECTION) continue;
    if (boundaries.some((b) => Math.abs(b - c.t) < MIN_SECTION)) continue;
    boundaries.push(c.t);
  }
  const snapped = boundaries.sort((a, b) => a - b).map((t) => snapToBeat(t, beats, 1));
  const edges = [0, ...snapped, duration];

  const sections: AudioSection[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i];
    const end = edges[i + 1];
    sections.push({ start, end, energy: mean(Math.floor(start), Math.max(Math.floor(start) + 1, Math.floor(end))) });
  }
  return labelSections(sections);
}

function labelSections(sections: AudioSection[]): AudioSection[] {
  const energies = sections.map((s) => s.energy);
  const median = percentile(energies, 0.5);
  const high = percentile(energies, 0.7);
  const low = percentile(energies, 0.3);
  let seenChorus = false;
  return sections.map((s, i): AudioSection => {
    const n = sections.length;
    let type: SectionType = 'verse';
    if (n > 2 && i === 0 && s.energy <= median) type = 'intro';
    else if (n > 2 && i === n - 1 && s.energy <= median) type = 'outro';
    else if (n > 1 && s.energy >= high) type = 'chorus';
    else if (seenChorus && s.energy <= low) type = 'bridge';
    if (type === 'chorus') seenChorus = true;
    return { ...s, type };
  });
}

export function snapToBeat(t: number, beats: number[], maxDistance: number): number {
  const i = lowerBound(beats, t);
  let best = t;
  let bestDist = maxDistance;
  for (const j of [i - 1, i]) {
    if (j >= 0 && j < beats.length && Math.abs(beats[j] - t) <= bestDist) {
      best = beats[j];
      bestDist = Math.abs(beats[j] - t);
    }
  }
  return best;
}

/** First index whose value is >= t. */
export function lowerBound(values: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (values[m] < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Caches analyses by file identity so style changes and re-uploads never re-analyze. */
@Injectable({ providedIn: 'root' })
export class AudioAnalyzerService {
  private readonly cache = new Map<string, AudioAnalysis>();

  async analyze(key: string, buffer: AudioBufferLike, onProgress?: ProgressFn): Promise<AudioAnalysis> {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const analysis = await analyzeAudio(buffer, onProgress);
    this.cache.set(key, analysis);
    return analysis;
  }
}
