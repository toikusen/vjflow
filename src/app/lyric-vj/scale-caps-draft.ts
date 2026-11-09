// What each world allows of Q3's one scale contrast a sung section (docs/research/2026-11-09-q3q5-codex.md §3): which
// safe-area edges a big word's ink box may sit on, what carries it off the frame, how far it may grow over its reading
// size, and how the world weighs near-equal candidates. A draft held here until phase 2 moves it into world-shared.ts
// (Codex §8: the shared file is not touched in phase 1). riso and screentone are Codex's two declared tastes; every other
// world's caps are derived from its own sets and carriers for the dry run only. No lyric patterns, no meaning guessed
// from a world's name.
import { SET_SPECS } from './render/world-sets';
import type { StyleWorld } from './style-world';

import { WORLD_SCALE, type CandidateWeights, type ScaleCarrierRole, type ScaleEdge } from './world-shared';
export type { CandidateWeights, ScaleCarrierRole, ScaleEdge };

export interface WorldScaleCaps {
  worldId: string;
  /** Edges the ink box may sit on, the world's preferred first. */
  edges: ScaleEdge[];
  carrierRole: ScaleCarrierRole;
  /** Allowed size over reading size, [least, most]; the law's own bounds are 1.6 and 2.4. */
  sizeRange: [number, number];
  candidateWeights: CandidateWeights;
  /** The scale change's curve: a cut into the composition before the line is sung (Codex §2), held while sung. */
  curve: 'cut';
  /** The world's declaration (world-shared.ts WORLD_SCALE), or derived from its sets for the dry run. */
  source: 'declared' | 'derived';
  /** Why, for the report. */
  note: string;
}

const EVEN: CandidateWeights = { short: 1, ratio: 1, room: 1, sustain: 1, order: 1 };

/** The declared worlds' caps (phase 2: the declaration lives in world-shared.ts WORLD_SCALE). */
export const DECLARED_SCALE_CAPS: Record<string, WorldScaleCaps> = Object.fromEntries(Object.entries(WORLD_SCALE).map(([id, s]) => [id, { worldId: id, ...s, source: 'declared' as const }]));

/** The edges a world's own sets already lean on (their anchors' sides): where its type stands, the big word may too. */
export function edgesOfSets(sets: string[]): ScaleEdge[] {
  const tally = new Map<ScaleEdge, number>();
  const add = (e: ScaleEdge) => tally.set(e, (tally.get(e) ?? 0) + 1);
  for (const id of sets) {
    const s = SET_SPECS[id];
    if (!s) continue;
    if (s.ay === 1 || s.at[1] >= 0.66) add('bottom');
    if (s.ay === -1 || s.at[1] <= 0.34) add('top');
    if (s.ax === -1 || s.at[0] <= 0.34) add('left');
    if (s.ax === 1 || s.at[0] >= 0.66) add('right');
  }
  const order: ScaleEdge[] = ['bottom', 'left', 'top', 'right'];
  const out = [...tally.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0])).map(([e]) => e);
  // (a world whose sets all stand centred still has a page with edges: bottom then left, as a printed page reads)
  return out.length ? out : ['bottom', 'left'];
}

/** A world's scale caps: Codex's declaration for riso and screentone, any other derived from its sets and carriers (dry run only). */
export function scaleCapsOf(world: Pick<StyleWorld, 'id' | 'layouts' | 'sheet' | 'standsOnPlate'>): WorldScaleCaps {
  const declared = DECLARED_SCALE_CAPS[world.id];
  if (declared) return declared;
  const sets = [...new Set(world.layouts.lines.map((l) => l.set))];
  const carried = sets.some((s) => SET_SPECS[s]?.object);
  const carrierRole: ScaleCarrierRole = world.sheet ? 'page' : world.standsOnPlate ? 'plate' : carried ? 'object' : 'ground';
  return { worldId: world.id, edges: edgesOfSets(sets), carrierRole, sizeRange: [1.6, 2.4], candidateWeights: EVEN, curve: 'cut', source: 'derived', note: 'derived from the world sets (anchors → edges, sheet/plate/object → carrier); not a declaration' };
}
