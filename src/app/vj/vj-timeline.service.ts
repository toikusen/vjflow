import { Injectable } from '@angular/core';
import { AudioAnalysis } from '../audio/audio-analysis.model';
import { percentile } from '../audio/audio-analyzer.service';
import { onsetStrengthAt } from '../audio/audio-features';
import { compositionKey, composeScene, ElementUse } from './compose-scene';
import { effectiveHitThreshold, fit, Look, neutralLook, TRANSITION_ENERGY } from './look';
import { pickMotif } from './motif';
import { createRng, pick, pickWeighted, Rng } from './seeded-random';
import { VJStyle } from './styles/vj-style.interface';
import { EnergyTier, TransitionType, VJScene } from './vj-project.model';

interface Segment {
  start: number;
  end: number;
  sectionType?: string;
}

const TIER_OFFSET: Record<EnergyTier, number> = { low: -1, mid: 0, high: 1 };

/**
 * Deterministic rule-based scene planner: AudioAnalysis + VJStyle + Look + seed → VJScene[].
 * Same inputs always yield the same scenes; change the seed to "regenerate".
 * Each scene aims at a target energy (song arousal, pushed by its tier as far as the song's
 * dynamics allow); presets and transitions are weighted by how well they fit that target.
 */
export function buildScenes(analysis: AudioAnalysis, style: VJStyle, seed: number, look: Look = neutralLook(style)): VJScene[] {
  const rng = createRng(seed);
  const segments = segmentTrack(analysis, style, look, rng);
  const energies = segments.map((s) => segmentEnergy(analysis, s.start, s.end));
  const lowCut = percentile(energies, 0.34);
  const highCut = percentile(energies, 0.67);
  const spread = Math.max(...energies) - Math.min(...energies);
  const fitTo = (energy: number, target: number) => (look.adaptive ? fit(energy, target) : 1);
  const hitThreshold = effectiveHitThreshold(style, look);
  const grammar = style.grammar;
  const motif = grammar ? pickMotif(look, grammar, seed) : undefined;

  let prevPreset = '';
  return segments.map((seg, i): VJScene => {
    const e = energies[i];
    const tier: EnergyTier = spread < 0.08 ? 'mid' : e <= lowCut ? 'low' : e >= highCut ? 'high' : 'mid';
    const effectiveTier: EnergyTier = seg.sectionType === 'chorus' && tier === 'low' ? 'mid' : tier;
    const target = Math.min(1, Math.max(0, look.arousal + TIER_OFFSET[effectiveTier] * (0.1 + 0.4 * look.dynamics)));

    let composition: ElementUse[] | undefined;
    let preset: string;
    if (motif && grammar) {
      composition = composeScene(motif, target, i, prevPreset, grammar, rng);
      preset = compositionKey(composition);
    } else {
      preset = pickLegacyPreset(style, effectiveTier, target, prevPreset, look, rng);
    }
    prevPreset = preset;

    const strongHit = i > 0 && onsetStrengthAt(analysis, seg.start, 0.08) >= hitThreshold;
    const transition: TransitionType =
      strongHit && fitTo(TRANSITION_ENERGY[style.impactTransition], target) >= 0.5
        ? style.impactTransition
        : pickWeighted(rng, style.transitions.map((t) => ({ weight: t.weight * fitTo(TRANSITION_ENERGY[t.type], target), value: t.type })));
    const intensity = Math.min(1, 0.25 + 0.75 * e);
    const durationScale = effectiveTier === 'high' ? 0.7 : effectiveTier === 'low' ? 1.4 : 1;

    return {
      id: `scene-${i}-${preset}`,
      start: seg.start,
      end: seg.end,
      preset,
      intensity,
      palette: pick(rng, look.palettes[effectiveTier]),
      composition,
      parameters: {
        tier: effectiveTier,
        target,
        transition,
        transitionDuration: Math.min(style.transitionDuration * durationScale, (seg.end - seg.start) / 3),
        variant: Math.floor(rng() * 4),
        speed: (0.6 + 0.8 * intensity) * look.speedScale,
        density: look.densityScale,
        sectionType: seg.sectionType ?? 'verse',
      },
    };
  });
}

/** Whole-scene presets for styles not yet migrated to element composition. */
function pickLegacyPreset(style: VJStyle, tier: EnergyTier, target: number, previous: string, look: Look, rng: Rng): string {
  const others = style.presets.filter((p) => p.id !== previous);
  const candidates = others.length ? others : style.presets;
  const weighted = candidates
    .map((p) => ({ value: p.id, weight: (look.adaptive ? fit(p.energy ?? 0.5, target) : 1) * (p.tiers.includes(tier) ? 1 : look.adaptive ? 0.3 : 0) }))
    .filter((c) => c.weight > 0);
  return weighted.length ? pickWeighted(rng, weighted) : pick(rng, candidates).id;
}

/** Splits analyzer sections into scene-sized pieces, cutting on the strongest nearby beat. */
function segmentTrack(analysis: AudioAnalysis, style: VJStyle, look: Look, rng: Rng): Segment[] {
  const min = style.sceneLength.min * look.sceneLengthScale;
  const max = style.sceneLength.max * look.sceneLengthScale;
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
  buildScenes(analysis: AudioAnalysis, style: VJStyle, seed: number, look?: Look): VJScene[] {
    return buildScenes(analysis, style, seed, look);
  }
}
