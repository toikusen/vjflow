import { ElementDef, ParamValues, sampleParams, Slot } from './elements/element';
import { ELEMENTS, FALLBACK_FIELD } from './elements/registry';
import { createRng, pickWeighted } from './seeded-random';
import { StyleGrammar } from './styles/vj-style.interface';

export interface ElementPick {
  id: string;
  params: ParamValues;
}

/** A song's signature: the few elements its scenes are built from, with song-level parameters. */
export interface Motif {
  field: ElementPick[];
  figures: ElementPick[];
  accents: ElementPick[];
  post: ElementPick[];
  /** The style's fixed overlays (letterbox, grain...), drawn on top of every scene. */
  overlay: ElementPick[];
}

export const MOTIF_SIZE: Record<Slot, number> = { field: 2, figure: 3, accent: 2, post: 1 };
/** Variety rule: no trait (lines, rotation, ...) may dominate a song's figures. */
export const MAX_FIGURES_PER_TRAIT = 2;

/**
 * Picks a song's motif from the style's element pool, favouring elements whose intensity
 * matches the song. Wider songs (high dynamics) accept a wider intensity range.
 * Deterministic for the same inputs.
 */
export function pickMotif(mood: { arousal: number; dynamics: number }, grammar: StyleGrammar, seed: number): Motif {
  const rng = createRng(seed ^ 0x5f3759df);
  const width = 0.06 + 0.2 * mood.dynamics;
  const affinity = (d: ElementDef) => grammar.elements[d.id] * Math.max(0.02, Math.exp(-((d.energy - mood.arousal) ** 2) / width));
  const pool = Object.keys(grammar.elements)
    .map((id) => ELEMENTS[id])
    .filter((d): d is ElementDef => !!d && !d.traits.some((t) => grammar.forbidden.includes(t)));
  const chosen: ElementDef[] = [];

  const compatible = (d: ElementDef) => {
    const clash = grammar.exclusive?.some(([a, b]) => (a === d.id && chosen.some((c) => c.id === b)) || (b === d.id && chosen.some((c) => c.id === a)));
    if (clash) return false;
    if (d.slot !== 'figure') return true;
    return d.traits.every((t) => chosen.filter((c) => c.slot === 'figure' && c.traits.includes(t)).length < MAX_FIGURES_PER_TRAIT);
  };

  const take = (slot: Slot): ElementPick[] => {
    const out: ElementPick[] = [];
    for (let k = 0; k < MOTIF_SIZE[slot]; k++) {
      const candidates = pool.filter((d) => d.slot === slot && !chosen.includes(d) && compatible(d));
      if (!candidates.length) break;
      const d = pickWeighted(rng, candidates.map((c) => ({ value: c, weight: affinity(c) })));
      chosen.push(d);
      out.push({ id: d.id, params: sampleParams({ ...d.params, ...grammar.params?.[d.id] }, rng) });
    }
    return out;
  };

  const field = take('field');
  if (!field.length) field.push({ id: FALLBACK_FIELD, params: sampleParams(ELEMENTS[FALLBACK_FIELD].params, rng) });
  const overlay = (grammar.overlay ?? []).filter((id) => ELEMENTS[id]).map((id) => ({ id, params: sampleParams(ELEMENTS[id].params, rng) }));
  return { field, figures: take('figure'), accents: take('accent'), post: take('post'), overlay };
}
