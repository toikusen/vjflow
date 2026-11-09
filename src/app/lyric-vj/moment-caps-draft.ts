// DRAFT (Q5 phase 1, docs/research/2026-11-09-q5-phase1.md): what each world can draw of a signature moment, derived from
// the world's own fields for a dry run. Not a declaration: no world has approved these values. Phase 2 moves the approved
// ones into world-shared.ts beside Q1's `compositions` (Codex §8: one integration change, not here).
import type { StyleWorld } from './style-world';

/**
 * Where a mini moment can live (Codex §5 table): `page` opens, splits or keeps a local part of the world's own paper or
 * plate; `scene` moves an object the world already has, when that object is about the line's meaning; `type-only` sets the
 * whole evidence phrase into one keep / echo / spacing relation (never a plain re-ink or zoom passed off as a moment).
 */
export type MomentFamily = 'type-only' | 'page' | 'scene';

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
  'type-only': ['echo/ghost', 'freeze/stop', 'shape/fall', 'shape/rise', 'shape/wave'],
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
