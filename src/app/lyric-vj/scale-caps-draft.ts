// What each world allows of Q3's one scale contrast a sung section (docs/research/2026-11-09-q3q5-codex.md §3): which
// safe-area edges a big word's ink box may sit on, what carries it off the frame, how far it may grow over its reading
// size, and how the world weighs near-equal candidates. A draft held here until phase 2 moves it into world-shared.ts
// (Codex §8: the shared file is not touched in phase 1). riso and screentone are Codex's two declared tastes; every other
// world's caps are derived from its own sets and carriers for the dry run only. No lyric patterns, no meaning guessed
// from a world's name.
import { SET_SPECS } from './render/world-sets';
import type { StyleWorld } from './style-world';

export type ScaleEdge = 'top' | 'bottom' | 'left' | 'right';
/** What the big word stands on, running off the frame on its edge's side: the paper, a colour plate, a comic panel, the page, an object, the bare ground. */
export type ScaleCarrierRole = 'paper' | 'plate' | 'panel' | 'page' | 'object' | 'ground';

/**
 * How a world weighs the candidates of a section, each feature 0–1 (scale-policy.ts features): `short` a phrase of few
 * glyphs, `ratio` how near the size law's 2.4× it reaches, `room` how much of the frame it leaves empty, `sustain` how long
 * the line holds past its reading time, `order` how plainly the big word and its rest read in order (one side only).
 */
export interface CandidateWeights { short: number; ratio: number; room: number; sustain: number; order: number }

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
  /** Codex's declaration, or derived from the world's sets for the dry run. */
  source: 'declared' | 'derived';
  /** Why, for the report. */
  note: string;
}

const EVEN: CandidateWeights = { short: 1, ratio: 1, room: 1, sustain: 1, order: 1 };

/**
 * Codex §3's two tastes. riso: the whole big word against the paper's outer edge, the same sheet / plate running off the
 * frame, a second plate never entering the main word's guard; among meaning candidates it prefers the shorter phrase,
 * more empty paper and a line that holds to be read. screentone: the big word against a panel's inner edge, page and
 * panel frame running off, tone and speed lines kept out of the reading area; it prefers the candidate that sets up a
 * main and a minor panel with a clear reading order.
 */
export const DECLARED_SCALE_CAPS: Record<string, WorldScaleCaps> = {
  riso: {
    worldId: 'riso',
    // (its sets anchor top-left and bottom-right: the paper's corners are where its type already sits)
    edges: ['bottom', 'left', 'top', 'right'],
    carrierRole: 'paper',
    sizeRange: [1.6, 2.4],
    candidateWeights: { short: 1.6, ratio: 1, room: 1.4, sustain: 1.3, order: 0.6 },
    curve: 'cut',
    source: 'declared',
    note: 'riso.edgeFit (Codex §3): paper edge, the sheet/plate runs off; prefers short phrases, empty paper, held lines',
  },
  screentone: {
    worldId: 'screentone',
    // (a manga page tiers its panels top to bottom: a panel bleeding off the page's top or bottom edge)
    edges: ['top', 'bottom'],
    carrierRole: 'panel',
    sizeRange: [1.6, 2.4],
    candidateWeights: { short: 0.8, ratio: 1, room: 0.7, sustain: 0.8, order: 1.8 },
    curve: 'cut',
    source: 'declared',
    note: 'screentone.edgeFit (Codex §3): panel inner edge, page and panel frame run off; prefers a clear main/minor panel reading order',
  },
};

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
