import { describe, expect, it } from 'vitest';
import { SET_SPECS } from './world-sets';
import { CARRIERS } from './world-objects';

describe('carriers (words on their own opaque object get no room cut round them)', () => {
  it('are objects some set really carries its line on', () => {
    const used = new Set(Object.values(SET_SPECS).map((s) => s.object).filter(Boolean));
    for (const o of CARRIERS) expect(used.has(o as never), o).toBe(true);
  });
  it('leave the approved worlds and the ones being rebuilt as they are', () => {
    for (const o of ['shikishi', 'cartouche', 'noshi', 'fold-kite', 'ink-stroke', 'lancet', 'twin-lancet', 'transom']) expect(CARRIERS.has(o), o).toBe(false);
  });
});
