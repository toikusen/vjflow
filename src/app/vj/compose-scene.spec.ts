import { composeScene, compositionKey, ElementUse, POST_MIN_TARGET } from './compose-scene';
import { ELEMENTS } from './elements/registry';
import { pickMotif } from './motif';
import { createRng } from './seeded-random';
import { EDM_STYLE } from './styles/edm.style';

const grammar = EDM_STYLE.grammar;
const motif = pickMotif({ arousal: 0.5, dynamics: 0.9 }, grammar, 3);
const slotCount = (uses: ElementUse[], slot: string) => uses.filter((u) => ELEMENTS[u.id].slot === slot).length;

describe('composeScene', () => {
  it('always has exactly one field, first', () => {
    const uses = composeScene(motif, 0.2, 0, '', grammar, createRng(1));
    expect(ELEMENTS[uses[0].id].slot).toBe('field');
    expect(slotCount(uses, 'field')).toBe(1);
  });

  it('gets busier as the target rises, within maxBusy', () => {
    const calm = composeScene(motif, 0.2, 0, '', grammar, createRng(1));
    const loud = composeScene(motif, 0.9, 0, '', grammar, createRng(1));
    const busy = (u: ElementUse[]) => slotCount(u, 'figure') + slotCount(u, 'accent');
    expect(busy(loud)).toBeGreaterThan(busy(calm));
    expect(busy(loud)).toBeLessThanOrEqual(grammar.maxBusy);
  });

  it('adds the post only above its threshold', () => {
    expect(slotCount(composeScene(motif, POST_MIN_TARGET - 0.1, 0, '', grammar, createRng(1)), 'post')).toBe(0);
    expect(slotCount(composeScene(motif, 0.9, 0, '', grammar, createRng(1)), 'post')).toBe(1);
  });

  it('never repeats the previous scene figure set', () => {
    const rng = createRng(5);
    let previous = '';
    for (let i = 0; i < 30; i++) {
      const key = compositionKey(composeScene(motif, 0.5, i, previous, grammar, rng));
      expect(key).not.toBe(previous);
      previous = key;
    }
  });

  it('appends overlays last, flagged', () => {
    const withOverlay = { ...motif, overlay: [{ id: 'filmFrame', params: {} }] };
    const uses = composeScene(withOverlay, 0.9, 0, '', grammar, createRng(1));
    expect(uses.at(-1)).toEqual({ id: 'filmFrame', params: {}, strength: 1, overlay: true });
  });

  it('shows intense elements faintly in calm scenes', () => {
    const bars = { id: 'spectrumBars', params: {} };
    const only = { ...motif, figures: [bars] };
    const calm = composeScene(only, 0.1, 0, '', grammar, createRng(1)).find((u) => u.id === 'spectrumBars')!;
    const loud = composeScene(only, 0.9, 0, '', grammar, createRng(1)).find((u) => u.id === 'spectrumBars')!;
    expect(calm.strength).toBeLessThan(loud.strength);
    expect(calm.strength).toBeGreaterThanOrEqual(0.4);
  });
});
