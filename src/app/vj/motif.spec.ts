import { figureKey } from './compose-scene';
import { ELEMENTS } from './elements/registry';
import { MAX_FIGURES_PER_TRAIT, Motif, pickMotif } from './motif';
import { createRng } from './seeded-random';
import { CUTE_STYLE } from './styles/cute.style';
import { EDM_STYLE } from './styles/edm.style';

const edm = EDM_STYLE.grammar!;
const cute = CUTE_STYLE.grammar!;
const ids = (m: Motif) => [...m.field, ...m.figures, ...m.accents, ...m.post].map((p) => p.id);
const fullKey = (m: Motif) => ids(m).join('|');
const jaccard = (a: string[], b: string[]) => {
  const union = new Set([...a, ...b]);
  return a.filter((x) => b.includes(x)).length / union.size;
};

describe('pickMotif', () => {
  it('is deterministic', () => {
    expect(pickMotif({ arousal: 0.4, dynamics: 0.5 }, edm, 7)).toEqual(pickMotif({ arousal: 0.4, dynamics: 0.5 }, edm, 7));
  });

  it('fills every slot from the style pool', () => {
    const m = pickMotif({ arousal: 0.5, dynamics: 0.5 }, edm, 1);
    expect(m.field.length).toBeGreaterThanOrEqual(1);
    expect(m.figures).toHaveLength(3);
    expect(m.accents).toHaveLength(2);
    expect(m.post).toHaveLength(1);
    ids(m).forEach((id) => expect(edm.elements[id]).toBeDefined());
  });

  it('respects forbidden traits, exclusive pairs and the per-trait figure cap', () => {
    for (let seed = 0; seed < 200; seed++) {
      const mood = { arousal: (seed % 10) / 10, dynamics: ((seed * 7) % 10) / 10 };
      const c = pickMotif(mood, cute, seed);
      ids(c).forEach((id) => expect(ELEMENTS[id].traits.some((t) => cute.forbidden.includes(t))).toBe(false));

      const e = pickMotif(mood, edm, seed);
      const figures = e.figures.map((f) => ELEMENTS[f.id]);
      expect(figures.some((f) => f.id === 'polyTunnel') && figures.some((f) => f.id === 'perspectiveGrid')).toBe(false);
      const traits = figures.flatMap((f) => f.traits);
      new Set(traits).forEach((t) => expect(traits.filter((x) => x === t).length).toBeLessThanOrEqual(MAX_FIGURES_PER_TRAIT));
    }
  });

  it('gives most songs their own motif', () => {
    const rng = createRng(2024);
    const motifs = Array.from({ length: 50 }, (_, i) => pickMotif({ arousal: rng(), dynamics: rng() }, edm, 1000 + i * 7919));
    expect(new Set(motifs.map(fullKey)).size).toBeGreaterThanOrEqual(40);
    expect(new Set(motifs.map((m) => figureKey(m.figures))).size).toBeGreaterThanOrEqual(15);
  });

  it('gives calm and intense songs mostly different figures', () => {
    const slow = Array.from({ length: 20 }, (_, i) => pickMotif({ arousal: 0.15, dynamics: 0.3 }, edm, i).figures.map((f) => f.id));
    const fast = Array.from({ length: 20 }, (_, i) => pickMotif({ arousal: 0.85, dynamics: 0.3 }, edm, 100 + i).figures.map((f) => f.id));
    const pairs = slow.flatMap((a) => fast.map((b) => jaccard(a, b)));
    expect(pairs.reduce((s, v) => s + v, 0) / pairs.length).toBeLessThan(0.4);
  });

  it('gives the same element different song-level parameters across songs', () => {
    const params = Array.from({ length: 20 }, (_, i) => pickMotif({ arousal: 0.5, dynamics: 0.5 }, edm, i))
      .flatMap((m) => m.figures)
      .filter((f) => f.id === 'polyTunnel' || f.id === 'lasers')
      .map((f) => JSON.stringify(f.params));
    expect(new Set(params).size).toBe(params.length);
  });
});
