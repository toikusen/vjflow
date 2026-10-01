import { ParamValues } from './elements/element';
import { ELEMENTS } from './elements/registry';
import { fit } from './look';
import { ElementPick, Motif } from './motif';
import { pickWeighted, Rng } from './seeded-random';
import { StyleGrammar } from './styles/vj-style.interface';

/** One element placed in a scene; `strength` lets intense motif elements show faintly in calm scenes. */
export interface ElementUse {
  id: string;
  params: ParamValues;
  strength: number;
  /** Drawn above everything, outside the post effect and camera move. */
  overlay?: boolean;
}

export const POST_MIN_TARGET = 0.6;

const strengthOf = (id: string, target: number) => Math.min(1, 0.4 + 0.6 * fit(ELEMENTS[id].energy, target));
const use = (p: ElementPick, target: number): ElementUse => ({ id: p.id, params: p.params, strength: strengthOf(p.id, target) });

/** All k-element subsets (motifs hold at most 3 figures, so this stays tiny). */
function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return items.flatMap((item, i) => combinations(items.slice(i + 1), k - 1).map((rest) => [item, ...rest]));
}

/**
 * Chooses which motif elements a scene shows: more and stronger elements as the target energy rises,
 * and never the exact figure set of the previous scene when the motif allows otherwise.
 */
export function composeScene(motif: Motif, target: number, index: number, previousKey: string, grammar: StyleGrammar, rng: Rng): ElementUse[] {
  const field = motif.field[index % motif.field.length];

  const figureCount = Math.min(motif.figures.length, target > 0.7 ? 2 : 1, grammar.maxBusy);
  const options = combinations(motif.figures, figureCount);
  const fresh = options.filter((o) => figureKey(o) !== previousKey);
  const figures = pickWeighted(
    rng,
    (fresh.length ? fresh : options).map((o) => ({ value: o, weight: o.reduce((w, f) => w * fit(ELEMENTS[f.id].energy, target), 1) })),
  );

  const accentCount = Math.min(motif.accents.length, target > 0.7 ? 2 : 1, grammar.maxBusy - figures.length);
  const accents = [...motif.accents]
    .sort((a, b) => fit(ELEMENTS[b.id].energy, target) - fit(ELEMENTS[a.id].energy, target))
    .slice(0, Math.max(0, accentCount));

  const post = target > POST_MIN_TARGET ? motif.post.slice(0, 1) : [];
  const overlays = motif.overlay.map((o): ElementUse => ({ id: o.id, params: o.params, strength: 1, overlay: true }));
  return [
    { id: field.id, params: field.params, strength: 1 },
    ...figures.map((f) => use(f, target)),
    ...accents.map((a) => use(a, target)),
    ...post.map((p) => use(p, target)),
    ...overlays,
  ];
}

export const figureKey = (figures: { id: string }[]): string =>
  figures
    .map((f) => f.id)
    .sort()
    .join('+');

/** Figure ids of a composed scene, used as the scene's `preset` label. */
export const compositionKey = (uses: ElementUse[]): string => figureKey(uses.filter((u) => ELEMENTS[u.id].slot === 'figure'));
