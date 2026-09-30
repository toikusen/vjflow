import { AudioAnalysis } from './audio-analysis.model';
import { onsetStrengthAt } from './audio-features';

/** Whole-song character derived from audio; every value except `tempo` is 0..1. */
export interface SongProfile {
  /** 0 sad … 1 happy. */
  valence: number;
  /** 0 calm … 1 intense. */
  arousal: number;
  /** 0 dark … 1 bright timbre. */
  brightness: number;
  /** Density of strong onsets. */
  pulse: number;
  /** Energy spread between quiet and loud sections. */
  dynamics: number;
  mode: 'major' | 'minor';
  modeConfidence: number;
  tempo: number;
}

/** Heuristic weights; tune by ear against real songs. */
export const PROFILE_WEIGHTS = {
  tempoRange: [70, 180] as const,
  centroidRange: [500, 4000] as const,
  /** Strong onsets per second mapped to pulse 0..1. */
  pulseRange: [0.5, 4] as const,
  strongOnset: 0.5,
  /** Major-vs-minor correlation gap that counts as full confidence. */
  modeGapForFullConfidence: 0.15,
  arousal: { tempo: 0.4, pulse: 0.3, bass: 0.3 },
  valence: { mode: 0.3, brightness: 0.15, tempo: 0.05 },
};

// Krumhansl–Kessler key profiles, index 0 = tonic.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const normalize = (v: number, [lo, hi]: readonly [number, number]) => clamp01((v - lo) / (hi - lo));

export function computeSongProfile(a: AudioAnalysis): SongProfile {
  const w = PROFILE_WEIGHTS;
  const { mode, modeConfidence } = detectMode(a.summary.chroma);
  const tempoNorm = normalize(a.tempo, w.tempoRange);
  const { centroidHz } = a.summary;
  const brightness = centroidHz > 0 ? normalize(Math.log(centroidHz), [Math.log(w.centroidRange[0]), Math.log(w.centroidRange[1])]) : 0.5;
  const strong = a.beats.filter((b) => onsetStrengthAt(a, b) > w.strongOnset).length;
  const pulse = a.duration > 0 ? normalize(strong / a.duration, w.pulseRange) : 0;
  const meanBass = a.frames.length ? a.frames.reduce((s, f) => s + f.bass, 0) / a.frames.length : 0;
  const dynamics = spread(a.sections.map((s) => s.energy));
  const modeSign = mode === 'major' ? 1 : -1;

  return {
    valence: clamp01(
      0.5 + w.valence.mode * modeSign * modeConfidence + w.valence.brightness * (brightness - 0.5) * 2 + w.valence.tempo * (tempoNorm - 0.5) * 2,
    ),
    arousal: clamp01(w.arousal.tempo * tempoNorm + w.arousal.pulse * pulse + w.arousal.bass * meanBass),
    brightness,
    pulse,
    dynamics,
    mode,
    modeConfidence,
    tempo: a.tempo,
  };
}

/** p90 − p10 with rounded indices, so two sections still count as a spread. */
function spread(values: number[]): number {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const at = (p: number) => sorted[Math.round(p * (sorted.length - 1))];
  return clamp01(at(0.9) - at(0.1));
}

/** Krumhansl–Schmuckler: correlate chroma with all 24 rotated key profiles. */
export function detectMode(chroma: number[]): { mode: 'major' | 'minor'; modeConfidence: number } {
  if (!chroma.some((v) => v > 0)) return { mode: 'major', modeConfidence: 0 };
  const best = (profile: number[]) =>
    Math.max(...Array.from({ length: 12 }, (_, tonic) => correlation(chroma, profile.map((_, i) => profile[(i - tonic + 12) % 12]))));
  const major = best(MAJOR_PROFILE);
  const minor = best(MINOR_PROFILE);
  return { mode: major >= minor ? 'major' : 'minor', modeConfidence: clamp01(Math.abs(major - minor) / PROFILE_WEIGHTS.modeGapForFullConfidence) };
}

function correlation(x: number[], y: number[]): number {
  const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}
