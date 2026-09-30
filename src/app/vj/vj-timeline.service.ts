import { Injectable } from '@angular/core';
import { AudioAnalysis } from '../audio/audio-analysis.model';
import { percentile } from '../audio/audio-analyzer.service';
import { onsetStrengthAt } from '../audio/audio-features';
import { createRng, pick, pickWeighted, Rng } from './seeded-random';
import { VJStyle } from './styles/vj-style.interface';
import { EnergyTier, TransitionType, VJScene } from './vj-project.model';

interface Segment {
  start: number;
  end: number;
  sectionType?: string;
}

/**
 * Deterministic rule-based scene planner: AudioAnalysis + VJStyle + seed → VJScene[].
 * Same inputs always yield the same scenes; change the seed to "regenerate".
 */
export function buildScenes(analysis: AudioAnalysis, style: VJStyle, seed: number): VJScene[] {
  const rng = createRng(seed);
  const segments = segmentTrack(analysis, style, rng);
  const energies = segments.map((s) => segmentEnergy(analysis, s.start, s.end));
  const lowCut = percentile(energies, 0.34);
  const highCut = percentile(energies, 0.67);
  const spread = Math.max(...energies) - Math.min(...energies);

  let prevPreset = '';
  return segments.map((seg, i): VJScene => {
    const e = energies[i];
    const tier: EnergyTier = spread < 0.08 ? 'mid' : e <= lowCut ? 'low' : e >= highCut ? 'high' : 'mid';
    const effectiveTier: EnergyTier = seg.sectionType === 'chorus' && tier === 'low' ? 'mid' : tier;

    const candidates = style.presets.filter((p) => p.tiers.includes(effectiveTier) && p.id !== prevPreset);
    const preset = pick(rng, candidates.length ? candidates : style.presets.filter((p) => p.id !== prevPreset)).id;
    prevPreset = preset;

    const strongHit = i > 0 && onsetStrengthAt(analysis, seg.start, 0.08) >= style.mapping.hitThreshold;
    const transition: TransitionType = strongHit
      ? style.impactTransition
      : pickWeighted(rng, style.transitions.map((t) => ({ weight: t.weight, value: t.type })));
    const intensity = Math.min(1, 0.25 + 0.75 * e);
    const durationScale = effectiveTier === 'high' ? 0.7 : effectiveTier === 'low' ? 1.4 : 1;

    return {
      id: `scene-${i}-${preset}`,
      start: seg.start,
      end: seg.end,
      preset,
      intensity,
      palette: pick(rng, style.palettes[effectiveTier]),
      parameters: {
        tier: effectiveTier,
        transition,
        transitionDuration: Math.min(style.transitionDuration * durationScale, (seg.end - seg.start) / 3),
        variant: Math.floor(rng() * 4),
        speed: 0.6 + 0.8 * intensity,
        sectionType: seg.sectionType ?? 'verse',
      },
    };
  });
}

/** Splits analyzer sections into scene-sized pieces, cutting on the strongest nearby beat. */
function segmentTrack(analysis: AudioAnalysis, style: VJStyle, rng: Rng): Segment[] {
  const { min, max } = style.sceneLength;
  const target = min + (max - min) * (0.4 + 0.2 * rng());
  const sections = analysis.sections.length ? analysis.sections : [{ start: 0, end: analysis.duration, energy: 0.5 }];
  const out: Segment[] = [];
  for (const sec of sections) {
    const len = sec.end - sec.start;
    const pieces = Math.max(1, Math.round(len / target), Math.ceil(len / max));
    let start = sec.start;
    for (let k = 1; k <= pieces; k++) {
      const end = k === pieces ? sec.end : strongestBeatNear(analysis, sec.start + (len * k) / pieces, 1.5);
      if (end - start > 0.5) out.push({ start, end, sectionType: sec.type });
      start = end;
    }
  }
  // Merge fragments too short to read as a scene.
  const merged: Segment[] = [];
  for (const seg of out) {
    const last = merged[merged.length - 1];
    if (last && seg.end - seg.start < min * 0.6) last.end = seg.end;
    else merged.push({ ...seg });
  }
  if (merged.length > 1 && merged[0].end - merged[0].start < min * 0.6) {
    merged[1].start = merged[0].start;
    merged.shift();
  }
  return merged;
}

function strongestBeatNear(analysis: AudioAnalysis, t: number, window: number): number {
  let best = t;
  let bestScore = -1;
  for (const b of analysis.beats) {
    if (b < t - window) continue;
    if (b > t + window) break;
    const score = onsetStrengthAt(analysis, b) - Math.abs(b - t) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

function segmentEnergy(analysis: AudioAnalysis, start: number, end: number): number {
  const { frames, frameInterval } = analysis;
  const from = Math.max(0, Math.floor(start / frameInterval));
  const to = Math.min(frames.length, Math.ceil(end / frameInterval));
  let sum = 0;
  for (let i = from; i < to; i++) sum += 0.6 * frames[i].energy + 0.4 * frames[i].bass;
  return to > from ? sum / (to - from) : 0;
}

@Injectable({ providedIn: 'root' })
export class VjTimelineService {
  buildScenes(analysis: AudioAnalysis, style: VJStyle, seed: number): VJScene[] {
    return buildScenes(analysis, style, seed);
  }
}
