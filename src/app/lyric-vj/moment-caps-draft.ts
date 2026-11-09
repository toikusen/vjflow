// DRAFT (Q5 phase 1, docs/research/2026-11-09-q5-phase1.md): what each world can draw of a signature moment, derived from
// the world's own fields for a dry run. Not a declaration: no world has approved these values. Phase 2 moves the approved
// ones into world-shared.ts beside Q1's `compositions` (Codex §8: one integration change, not here).
// Phase 2 (2026-11-10): the declaration lives in world-shared.ts WORLD_MOMENTS; declaredMomentCaps reads it (the free
// path), momentCapsOf stays the phase-1 derivation for the dry run.
import type { StyleWorld } from './style-world';
import { momentsCapOf, type MomentFamily } from './world-shared';
export type { MomentFamily };

export interface WorldMomentCaps {
  worldId: string;
  /** The big moment: render/signature.ts takes the line's whole treatment over the world's frame. */
  big: boolean;
  /** Families a mini moment can be drawn in, best fit first; empty = no mini. */
  mini: MomentFamily[];
  /** The world's own set pieces and the words each is about (a scene mini needs one about the evidence word). */
  pieces: { id: string; words?: RegExp }[];
  /** Always `derived` in phase 1: read off the world's fields, never approved. */
  source: 'derived' | 'declared';
  why: string;
}

/**
 * The forms each mini family can carry, as `form/variant` (`form/*` = every variant). A form not listed has no honest mini
 * in that family and the candidate is refused there (Codex: no full-screen effect shrunk into a corner). Scene accepts any
 * form, but only on a piece whose words hold the evidence word.
 */
export const MINI_FORMS: Record<MomentFamily, string[]> = {
  page: ['strike/tear', 'strike/slice', 'strike/burn', 'strike/wipe', 'freeze/stop', 'echo/ghost'],
  scene: ['strike/*', 'shape/*', 'freeze/*', 'echo/*'],
  // (critic 2026-11-10: type-only acts on the line's own phrase in its own seat, never extra copies in free space; only
  // the forms with a motion of the sung words themselves: a crest runs on from the word, the word sinks or lifts)
  'type-only': ['shape/fall', 'shape/rise', 'shape/wave'],
};

export const familyCarries = (family: MomentFamily, form: string, variant: string) => MINI_FORMS[family].some((k) => k === `${form}/${variant}` || k === `${form}/*`);

/**
 * A world's moment caps, derived: a big moment wherever the world does not run its own moves (document's feed/tear and
 * watercolor's strokes would fight a takeover of the line); a page mini on a sheet world; a scene mini where the world has
 * set pieces; type-only everywhere.
 */
export function momentCapsOf(world: StyleWorld): WorldMomentCaps {
  const pieces = world.pieces.map((id) => ({ id, ...(world.pieceWords?.[id] ? { words: world.pieceWords[id] } : {}) }));
  const mini: MomentFamily[] = [...(pieces.length ? ['scene' as const] : []), ...(world.sheet ? ['page' as const] : []), 'type-only'];
  const big = !world.ownMoves;
  const why = [big ? 'big: signature overlay' : 'no big: the world runs its own moves', world.sheet ? 'page: sheet world' : '', pieces.length ? `scene: ${pieces.length} pieces` : ''].filter(Boolean).join('; ');
  return { worldId: world.id, big, mini, pieces, source: 'derived', why };
}

/**
 * A world's declared moment caps (world-shared.ts WORLD_MOMENTS), for the free path: undefined for a world that declares
 * none (no Q5 candidate). Its pieces are listed only for a family the world renders (scene is pending everywhere).
 */
export function declaredMomentCaps(world: StyleWorld): WorldMomentCaps | undefined {
  const d = momentsCapOf(world.id);
  if (!d) return undefined;
  const pieces = d.mini.includes('scene') ? world.pieces.map((id) => ({ id, ...(world.pieceWords?.[id] ? { words: world.pieceWords[id] } : {}) })) : [];
  return { worldId: world.id, big: d.big, mini: [...d.mini], pieces, source: 'declared', why: `declared (world-shared WORLD_MOMENTS): big ${d.big ? 'yes' : 'no'}; mini ${d.mini.join('/') || 'none'}${d.pending ? `; pending ${Object.keys(d.pending).join('/')}` : ''}` };
}
