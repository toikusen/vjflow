import { AudioAnalysis, AudioFeatureFrame } from './audio-analysis.model';
import { lowerBound } from './audio-analyzer.service';

export const emptyFrame = (): Required<AudioFeatureFrame> => ({ time: 0, energy: 0, bass: 0, mid: 0, treble: 0, spectralFlux: 0 });

/**
 * Linearly interpolated features at `time`. Pass `out` to avoid per-frame allocation.
 */
export function getFeaturesAt(analysis: AudioAnalysis, time: number, out: Required<AudioFeatureFrame> = emptyFrame()): Required<AudioFeatureFrame> {
  const { frames, frameInterval } = analysis;
  out.time = time;
  if (!frames.length) return Object.assign(out, emptyFrame(), { time });
  const pos = Math.min(frames.length - 1, Math.max(0, time / frameInterval));
  const i = Math.floor(pos);
  const a = frames[i];
  const b = frames[Math.min(frames.length - 1, i + 1)];
  const t = pos - i;
  out.energy = a.energy + (b.energy - a.energy) * t;
  out.bass = a.bass + (b.bass - a.bass) * t;
  out.mid = a.mid + (b.mid - a.mid) * t;
  out.treble = a.treble + (b.treble - a.treble) * t;
  out.spectralFlux = (a.spectralFlux ?? 0) + ((b.spectralFlux ?? 0) - (a.spectralFlux ?? 0)) * t;
  return out;
}

/** Index of the last beat at or before `time`, or -1. */
export function beatIndexAt(beats: number[], time: number): number {
  return lowerBound(beats, time + 1e-9) - 1;
}

/** Max spectral flux around `time` (±window) — used to rate how "hard" a beat hits. */
export function onsetStrengthAt(analysis: AudioAnalysis, time: number, window = 0.05): number {
  const { frames, frameInterval } = analysis;
  const from = Math.max(0, Math.floor((time - window) / frameInterval));
  const to = Math.min(frames.length - 1, Math.ceil((time + window) / frameInterval));
  let max = 0;
  for (let i = from; i <= to; i++) max = Math.max(max, frames[i].spectralFlux ?? 0);
  return max;
}
